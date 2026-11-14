begin;
set local lock_timeout = '5s';

create table public.hr_resignation_settlements (
  request_id uuid primary key references public.salary_requests(id),
  withdrawal_id uuid unique references public.salary_withdraw_requests(id),
  available_amount numeric not null,
  unpaid_sources boolean not null,
  settlement_status text not null check (settlement_status in ('withdrawal_pending', 'no_balance', 'bank_review')),
  created_at timestamptz not null default now()
);
alter table public.hr_resignation_settlements enable row level security;
revoke all on public.hr_resignation_settlements from public, anon, authenticated, service_role;

-- Table names are chosen exclusively from the two known store configurations.
create function public.hr_settle_departing_staff(p_org text,p_employee text,p_at timestamptz,p_start date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  orders text := case p_org when 'qiunai' then 'qiunai_salary_orders' when 'deepnight' then 'play_orders' end;
  bonuses text := case p_org when 'qiunai' then 'qiunai_staff_bonus' when 'deepnight' then 'players_bonus' end;
  guild_filter text := case when p_org = 'deepnight' then 'and (guild_id is null or guild_id::text = ''1501098191813214312'')' else '' end;
  period text := 'resignation-' || to_char(p_at at time zone 'Asia/Taipei','YYYY-MM-DD');
  settlement_day date := (p_at at time zone 'Asia/Taipei')::date;
  source record;
begin
  for source in execute format(
    $query$select id,staff_name,staff_salary,bonus_amount from public.%I where discord_id=$1
    and order_finished_at >= ($3::timestamp at time zone 'Asia/Taipei') and order_finished_at <= $2
    and is_deleted is distinct from true and wallet_settled_at is null
    and coalesce(status,'') not in ('已入帳','已發薪') %s order by id for update$query$, orders, guild_filter
  ) using p_employee,p_at,p_start loop
    insert into public.salary_wallet_entries(app_key,discord_id,staff_name,entry_type,amount,source_table,source_id,source_label,period_key,settlement_date,metadata)
    select p_org,p_employee,source.staff_name,component.kind,component.amount,orders,source.id::text,'離職結算',period,settlement_day,'{}'::jsonb
    from (values ('order_salary',source.staff_salary),('order_bonus',source.bonus_amount)) component(kind,amount)
    where component.amount <> 0
    on conflict (app_key,source_table,source_id,entry_type) do nothing;
    execute format('update public.%I set status = ''已入帳'', paid_at=$1, wallet_settled_at=$1, wallet_period_key=$2 where id=$3',orders)
      using p_at,period,source.id;
  end loop;

  for source in execute format(
    $query$select id,staff_name,amount from public.%I where discord_id=$1
    and created_at >= ($3::timestamp at time zone 'Asia/Taipei') and created_at <= $2
    and wallet_settled_at is null order by id for update$query$, bonuses
  ) using p_employee,p_at,p_start loop
    insert into public.salary_wallet_entries(app_key,discord_id,staff_name,entry_type,amount,source_table,source_id,source_label,period_key,settlement_date,metadata)
    select p_org,p_employee,source.staff_name,'staff_bonus',source.amount,bonuses,source.id::text,'離職結算',period,settlement_day,'{}'::jsonb
    where source.amount <> 0
    on conflict (app_key,source_table,source_id,entry_type) do nothing;
    execute format('update public.%I set wallet_settled_at=$1, wallet_period_key=$2 where id=$3',bonuses)
      using p_at,period,source.id;
  end loop;
end $$;
revoke all on function public.hr_settle_departing_staff(text,text,timestamptz,date) from public, anon, authenticated, service_role;

create function public.hr_approve_resignation(
  p_request_id uuid, p_org text, p_reviewer text, p_reviewer_name text, p_note text, p_wallet_start date
) returns public.salary_requests
language plpgsql security definer set search_path = '' as $$
declare
  item public.salary_requests%rowtype;
  staff jsonb;
  approved_at timestamptz := statement_timestamp();
  balance numeric;
  unpaid boolean;
  verified_bank boolean;
  withdrawal uuid;
  outcome text;
begin
  select * into item from public.salary_requests
  where id = p_request_id and organization_code = p_org for update;
  if not found or item.request_type is distinct from '離職申請書'
    or item.approval_category is distinct from 'administrative'
    or p_org not in ('qiunai','deepnight') or p_wallet_start is null then
    raise exception '找不到離職申請' using errcode = '23514';
  end if;
  if item.discord_id = p_reviewer or item.discord_id = '847840193859682304'
    or p_reviewer is null or length(coalesce(p_note, '')) > 2000
    or public.hr_salary_reviewer_role(p_org, p_reviewer) not in ('PIC','Manager') then
    raise exception '無權核准此離職申請' using errcode = '23514';
  end if;
  if item.status = 'approved' and item.reviewed_by = p_reviewer
    and exists (select 1 from public.hr_resignation_settlements where request_id = item.id) then
    return item;
  end if;
  if item.status is distinct from 'pending' then
    raise exception '此申請已處理，請重新整理' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('salary-asd:' || p_org || ':' || item.discord_id, 0));
  if p_org = 'qiunai' then
    select to_jsonb(s) into staff from public.qiunai_staff s where discord_id = item.discord_id for update;
  else
    select to_jsonb(s) into staff from public.players s where discord_id = item.discord_id and guild_id::text = '1501098191813214312' for update;
  end if;
  if staff is null or staff->>'is_active' = 'false' then
    raise exception '此店員工已封存或不存在' using errcode = '23514';
  end if;

  perform public.hr_settle_departing_staff(p_org,item.discord_id,approved_at,p_wallet_start);
  if p_org = 'qiunai' then
    unpaid := exists (select 1 from public.qiunai_salary_orders where discord_id = item.discord_id
        and is_deleted is distinct from true and order_finished_at is not null
        and wallet_settled_at is null and coalesce(status,'') not in ('已入帳','已發薪'))
      or exists (select 1 from public.qiunai_staff_bonus where discord_id = item.discord_id and wallet_settled_at is null);
  else
    unpaid := exists (select 1 from public.play_orders where discord_id = item.discord_id
        and (guild_id is null or guild_id::text = '1501098191813214312')
        and is_deleted is distinct from true and order_finished_at is not null
        and wallet_settled_at is null and coalesce(status,'') not in ('已入帳','已發薪'))
      or exists (select 1 from public.players_bonus where discord_id = item.discord_id and wallet_settled_at is null);
  end if;

  -- Existing assignments can still finish after the resignation. Flag them for follow-up.
  unpaid := unpaid or exists (
    select 1 from public.play_orders
    where guild_id::text = case when p_org = 'qiunai' then '1206138511535898654' else '1501098191813214312' end
      and is_deleted is distinct from true
      and status in ('accepted','in_progress')
      and item.discord_id = any(regexp_split_to_array(btrim(coalesce(assigned_player,'')), '\s*,\s*'))
  );

  select coalesce((select sum(amount) from public.salary_wallet_entries
      where app_key = p_org and discord_id = item.discord_id and settlement_date >= p_wallet_start), 0)
    - coalesce((select sum(amount) from public.salary_withdraw_requests
      where app_key = p_org and discord_id = item.discord_id and status in ('pending','approved')
        and requested_at >= p_wallet_start::timestamp at time zone 'Asia/Taipei'), 0)
    into balance;

  select coalesce((
    select nullif(btrim(c.form_data->>'bank_name'),'') = nullif(btrim(staff->>'bank_name'),'')
      and nullif(btrim(c.form_data->>'bank_account'),'') = nullif(btrim(staff->>'bank_account'),'')
      and nullif(btrim(staff->>'real_name'),'') is not null
    from public.employment_contract_signings c
    where c.discord_id = item.discord_id and c.organization_code in ('qiunai','deepnight') and c.status in ('signed','activated')
      and c.contract_version = 'v2.2' and c.signed_at is not null
    order by c.signed_at desc limit 1
  ),false) into verified_bank;

  if floor(balance) <= 0 then
    outcome := 'no_balance';
  elsif not verified_bank then
    outcome := 'bank_review';
  else
    insert into public.salary_withdraw_requests
      (app_key,discord_id,staff_name,amount,service_fee,welfare_fee,payout_amount,status,destination,request_note)
    values (p_org,item.discord_id,item.staff_name,floor(balance),0,0,floor(balance),'pending','bank','離職結算 ' || item.id::text)
    returning id into withdrawal;
    insert into public.hr_bank_payout_details (request_id,primary_discord_id,bank_name,bank_account)
    values (withdrawal,item.discord_id,btrim(staff->>'bank_name'),btrim(staff->>'bank_account'));
    outcome := 'withdrawal_pending';
  end if;

  if p_org = 'qiunai' then
    update public.qiunai_staff set is_active=false,is_online=false,can_take_order=false,updated_at=approved_at where discord_id=item.discord_id;
    update public.qiunai_admins set is_active=false where discord_id=item.discord_id and is_active;
  else
    update public.players set is_active=false,is_online=false,can_take_order=false,updated_at=approved_at
      where discord_id=item.discord_id and guild_id::text='1501098191813214312';
    update public.admins set is_active=false where discord_id=item.discord_id and is_active;
  end if;
  update public.salary_public_profiles set is_active=false,is_online=false,can_take_order=false,is_featured=false,featured_month=null,updated_at=approved_at
    where app_key=p_org and discord_id=item.discord_id;
  delete from public.hr_manager_memberships where organization_code=p_org and discord_id=item.discord_id;
  update public.device_audit_role_memberships set is_active=false
    where organization_code=p_org and discord_id=item.discord_id;
  insert into public.erp_role_assignments (organization_code,discord_id,display_name,role,is_active,created_by,updated_by)
    values (p_org,item.discord_id,item.staff_name,'employee',false,p_reviewer,p_reviewer)
    on conflict (organization_code,discord_id) do update set
      is_active=false,updated_at=approved_at,updated_by=p_reviewer;

  insert into public.hr_resignation_settlements (request_id,withdrawal_id,available_amount,unpaid_sources,settlement_status)
  values (item.id,withdrawal,balance,unpaid,outcome);
  update public.salary_requests set status='approved', reviewed_by=p_reviewer, reviewed_at=approved_at,
    review_result=coalesce(nullif(btrim(p_note),''),'核准'), updated_at=approved_at,
    form_data=coalesce(form_data,'{}'::jsonb) || jsonb_build_object(
      'reviewer_name',p_reviewer_name,'reviewer_discord_id',p_reviewer,'archived_at',approved_at,
      'withdrawal_id',withdrawal,'settlement_status',outcome,'unpaid_sources',unpaid,
      'withdrawal_amount',case when withdrawal is not null then floor(balance) end)
  where id=item.id returning * into item;
  return item;
end $$;

revoke all on function public.hr_approve_resignation(uuid,text,text,text,text,date) from public, anon, authenticated;
grant execute on function public.hr_approve_resignation(uuid,text,text,text,text,date) to service_role;
create function public.hr_require_resignation_effect() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'approved' and old.request_type = '離職申請書' and old.approval_category = 'administrative'
    and not exists (select 1 from public.hr_resignation_settlements where request_id = old.id) then
    raise exception '請由目前的 EIP 人事簽核頁核准' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.hr_require_resignation_effect() from public, anon, authenticated;
create trigger hr_require_resignation_effect before update of status on public.salary_requests
for each row execute function public.hr_require_resignation_effect();

-- Older single-store clients can write withdrawal requests directly. Use
-- the same reservation lock before reading the current employment state.
create function public.hr_guard_resigned_withdrawal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.app_key not in ('qiunai','deepnight') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('salary-asd:' || new.app_key || ':' || new.discord_id, 0));
  if (new.app_key = 'qiunai' and exists (
        select 1 from public.qiunai_staff where discord_id = new.discord_id and is_active = false))
    or (new.app_key = 'deepnight' and exists (
        select 1 from public.players where discord_id = new.discord_id and is_active = false)) then
    raise exception '離職尾款須交由財務處理' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.hr_guard_resigned_withdrawal() from public, anon, authenticated;
create trigger hr_guard_resigned_withdrawal before insert on public.salary_withdraw_requests
for each row execute function public.hr_guard_resigned_withdrawal();

-- A legacy Discord button may still be visible after the staff record is archived.
create function public.hr_guard_archived_order_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  org text := case new.guild_id::text
    when '1206138511535898654' then 'qiunai' when '1501098191813214312' then 'deepnight' end;
  existing text[] := array[]::text[];
  candidate text;
begin
  if org is null or new.order_type = '打賞' then return new; end if;
  if tg_op = 'UPDATE' and new.guild_id is not distinct from old.guild_id then
    if new.assigned_player is not distinct from old.assigned_player then return new; end if;
    existing := regexp_split_to_array(btrim(coalesce(old.assigned_player, '')), '\s*,\s*');
  end if;
  for candidate in select distinct id from unnest(
    regexp_split_to_array(btrim(coalesce(new.assigned_player, '')), '\s*,\s*')
  ) ids(id) where id ~ '^[0-9]{15,22}$' and not id = any(existing) order by id loop
    if org = 'qiunai' then
      perform 1 from public.qiunai_staff where discord_id = candidate and is_active is distinct from false for share;
      if found then continue; end if;
      if not exists (select 1 from public.qiunai_staff where discord_id = candidate and is_active = false) then continue; end if;
    else
      perform 1 from public.players where discord_id = candidate and is_active is distinct from false for share;
      if found then continue; end if;
      if not exists (select 1 from public.players where discord_id = candidate and is_active = false) then continue; end if;
    end if;
    raise exception '該陪陪已停用，請重新選擇接單人員' using errcode = '23514';
  end loop;
  return new;
end $$;
revoke all on function public.hr_guard_archived_order_assignment() from public, anon, authenticated;
create trigger hr_guard_archived_order_assignment before insert or update of assigned_player,guild_id on public.play_orders
for each row execute function public.hr_guard_archived_order_assignment();

notify pgrst, 'reload schema';
commit;
