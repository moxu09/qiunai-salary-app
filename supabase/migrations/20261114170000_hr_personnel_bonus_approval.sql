begin;
set local lock_timeout = '5s';

create table public.hr_personnel_bonus_approvals (
  request_id uuid primary key references public.salary_requests(id),
  reviewer_id text not null,
  approved_amount integer not null check (approved_amount > 0),
  bonus_id uuid not null unique
);

alter table public.hr_personnel_bonus_approvals enable row level security;
revoke all on table public.hr_personnel_bonus_approvals from public, anon, authenticated, service_role;

-- Keep eligibility in the database so both stores and the legacy submission routes use it.
create function public.hr_welfare_eligibility(p_org text, p_employee text, p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  month_start timestamptz := date_trunc('month', p_date::timestamp) at time zone 'Asia/Taipei';
  prior_start timestamptz := (date_trunc('month', p_date::timestamp) - interval '1 month') at time zone 'Asia/Taipei';
  salary numeric;
  birth_month integer;
  active boolean;
begin
  if p_org = 'qiunai' then
    select is_active is distinct from false into active from public.qiunai_staff where discord_id = p_employee;
    select coalesce((select sum(staff_salary) from public.qiunai_salary_orders
      where discord_id = p_employee and is_deleted is distinct from true and order_finished_at >= prior_start and order_finished_at < month_start),0)
      + coalesce((select sum(amount) from public.qiunai_staff_bonus
      where discord_id = p_employee and created_at >= prior_start and created_at < month_start),0) into salary;
  elsif p_org = 'deepnight' then
    select is_active is distinct from false into active from public.players where discord_id = p_employee;
    select coalesce((select sum(staff_salary) from public.play_orders
      where discord_id = p_employee and (guild_id is null or guild_id::text = '1501098191813214312')
        and is_deleted is distinct from true and order_finished_at >= prior_start and order_finished_at < month_start),0)
      + coalesce((select sum(amount) from public.players_bonus
      where discord_id = p_employee and created_at >= prior_start and created_at < month_start),0) into salary;
  end if;

  select case when (form_data->>'birthday') ~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$'
      then substring(form_data->>'birthday' from 6 for 2)::integer end
    into birth_month
  from public.employment_contract_signings
  where discord_id = p_employee and organization_code in ('qiunai','deepnight') and contract_version = 'v2.2'
    and status in ('signed','activated') and signed_at is not null
  order by signed_at desc limit 1;

  return jsonb_build_object(
    'priorMonthSalary', salary,
    'welfareEligible', coalesce(active and salary >= 5000, false),
    'birthdayEligible', coalesce(active and salary >= 5000 and birth_month = extract(month from p_date), false)
  );
end $$;

create function public.hr_guard_welfare_application() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Taipei')::date;
  eligibility jsonb;
begin
  if new.request_group is distinct from 'welfare' then return new; end if;
  new.application_date := today;
  perform pg_advisory_xact_lock(hashtextextended('hr-welfare:' || new.organization_code || ':' || new.discord_id, 0));
  eligibility := public.hr_welfare_eligibility(new.organization_code, new.discord_id, today);
  if not (eligibility->>'welfareEligible')::boolean then
    raise exception '前一個月薪資須滿 5,000 元才可申請福利' using errcode = '23514';
  end if;
  if new.request_type = '生日禮金' then
    if not (eligibility->>'birthdayEligible')::boolean then
      raise exception '生日禮金只限生日當月申請，請確認合約生日資料' using errcode = '23514';
    end if;
    if exists (select 1 from public.salary_requests
      where organization_code = new.organization_code and discord_id = new.discord_id and request_type = '生日禮金'
        and request_group = 'welfare' and status in ('pending','approved')
        and application_date >= date_trunc('year', today::timestamp)::date) then
      raise exception '今年已申請生日禮金' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger hr_guard_welfare_application before insert on public.salary_requests
for each row execute function public.hr_guard_welfare_application();

create function public.hr_approve_personnel_bonus(
  p_request_id uuid,
  p_organization text,
  p_reviewer_id text,
  p_reviewer_name text,
  p_note text
) returns public.salary_requests
language plpgsql security definer set search_path = '' as $$
declare
  item public.salary_requests%rowtype;
  previous public.hr_personnel_bonus_approvals%rowtype;
  new_bonus_id uuid;
  approved_at timestamptz := statement_timestamp();
  source_note text;
  award_amount integer;
  eligibility jsonb;
begin
  select * into item from public.salary_requests
  where id = p_request_id and organization_code = p_organization for update;

  if not found
    or item.organization_code not in ('qiunai', 'deepnight')
    or item.request_group is distinct from 'welfare'
    or item.request_type not in ('生日禮金','開工紅包','肉粽補助','月餅補助','聖誕補助') then
    raise exception '找不到可自動新增獎金或津貼的申請' using errcode = '23514';
  end if;

  if p_reviewer_id is null or p_reviewer_id = item.discord_id
    or p_reviewer_id = item.first_reviewed_by or item.first_reviewed_by is null or item.first_reviewed_at is null
    or public.hr_salary_reviewer_role(item.organization_code, p_reviewer_id) is distinct from 'PIC' then
    raise exception '獎金或津貼須由 Manager 初核後交另一位 PIC 覆核' using errcode = '23514';
  end if;

  award_amount := case when item.request_type = '生日禮金' then 200 else 100 end;
  if length(coalesce(p_note, '')) > 2000 then
    raise exception '簽核說明不得超過 2,000 字' using errcode = '23514';
  end if;

  select * into previous from public.hr_personnel_bonus_approvals where request_id = item.id;
  if found and item.status = 'approved' and previous.reviewer_id = p_reviewer_id
    and previous.approved_amount = award_amount then
    return item;
  end if;
  if item.status is distinct from 'pending' then
    raise exception '此申請已處理，請重新整理' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('salary-asd:' || item.organization_code || ':' || item.discord_id, 0));
  if item.request_type = '生日禮金' then
    perform pg_advisory_xact_lock(hashtextextended('hr-welfare:' || item.organization_code || ':' || item.discord_id, 0));
    if exists (select 1 from public.salary_requests where id <> item.id
        and organization_code = item.organization_code and discord_id = item.discord_id
        and request_type = '生日禮金' and request_group = 'welfare' and status = 'approved'
        and date_trunc('year', application_date::timestamp) = date_trunc('year', item.application_date::timestamp)) then
      raise exception '該年度已核准生日禮金' using errcode = '23514';
    end if;
  end if;
  eligibility := public.hr_welfare_eligibility(item.organization_code, item.discord_id, item.application_date);
  if not (eligibility->>'welfareEligible')::boolean then
    raise exception '未達申請時的前月薪資門檻，或已非在職員工' using errcode = '23514';
  end if;
  if item.request_type = '生日禮金' and not (eligibility->>'birthdayEligible')::boolean then
    raise exception '生日禮金須在生日當月申請' using errcode = '23514';
  end if;

  source_note := '簽核申請 ' || item.id::text;
  if item.organization_code = 'qiunai' then
    insert into public.qiunai_staff_bonus (discord_id, staff_name, title, amount, note, created_at)
    values (item.discord_id, item.staff_name, item.request_type, award_amount, source_note, approved_at)
    returning id into new_bonus_id;
  else
    insert into public.players_bonus (discord_id, staff_name, bonus_type, description, amount, created_at)
    values (item.discord_id, item.staff_name, item.request_type, source_note, award_amount, approved_at)
    returning id into new_bonus_id;
  end if;

  insert into public.hr_personnel_bonus_approvals (request_id, reviewer_id, approved_amount, bonus_id)
  values (item.id, p_reviewer_id, award_amount, new_bonus_id);

  update public.salary_requests set
    status = 'approved',
    review_result = coalesce(nullif(btrim(p_note), ''), '核准'),
    reviewed_by = p_reviewer_id,
    reviewed_at = approved_at,
    updated_at = approved_at,
    form_data = coalesce(form_data, '{}'::jsonb) || jsonb_build_object(
      'reviewer_name', p_reviewer_name,
      'reviewer_discord_id', p_reviewer_id,
      'approved_amount', award_amount
    )
  where id = item.id returning * into item;
  return item;
end $$;

revoke all on function public.hr_approve_personnel_bonus(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.hr_approve_personnel_bonus(uuid, text, text, text, text)
  to service_role;

revoke all on function public.hr_welfare_eligibility(text,text,date), public.hr_guard_welfare_application() from public, anon, authenticated;
grant execute on function public.hr_welfare_eligibility(text,text,date) to service_role;

create function public.hr_require_welfare_effect() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'approved' and old.request_group = 'welfare' and old.request_type in ('生日禮金','開工紅包','肉粽補助','月餅補助','聖誕補助')
    and not exists (select 1 from public.hr_personnel_bonus_approvals where request_id = old.id) then
    raise exception '請由目前的 EIP 人事簽核頁核准' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.hr_require_welfare_effect() from public, anon, authenticated;
create trigger hr_require_welfare_effect before update of status on public.salary_requests
for each row execute function public.hr_require_welfare_effect();

notify pgrst, 'reload schema';
commit;
