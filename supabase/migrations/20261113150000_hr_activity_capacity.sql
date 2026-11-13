begin;

alter table public.qiunai_activities add column if not exists capacity integer check (capacity > 0);
alter table public.deepnight_activities add column if not exists capacity integer check (capacity > 0);

-- Count each employee once, plus each guest, regardless of option selections.
create or replace function public.hr_activity_occupied(
  p_store text, p_activity_id uuid, p_exclude_discord_id text default null
) returns integer language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_store = 'qiunai' then
    return (select count(distinct r.id) + count(g.id)
      from public.qiunai_activity_responses r
      left join public.qiunai_activity_guests g on g.response_id = r.id
      where r.activity_id = p_activity_id and r.response_status = 'attending'
        and r.discord_id is distinct from p_exclude_discord_id);
  elsif p_store = 'deepnight' then
    return (select count(distinct r.id) + count(g.id)
      from public.deepnight_activity_responses r
      left join public.deepnight_activity_guests g on g.response_id = r.id
      where r.activity_id = p_activity_id and r.response_status = 'attending'
        and r.discord_id is distinct from p_exclude_discord_id);
  end if;
  raise exception '店別不正確';
end;
$$;
revoke all on function public.hr_activity_occupied(text, uuid, text) from public, anon, authenticated;
grant execute on function public.hr_activity_occupied(text, uuid, text) to service_role;

create or replace function public.hr_activity_validate_capacity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.capacity is distinct from old.capacity and new.capacity is not null and
    public.hr_activity_occupied(tg_argv[0], new.id) > new.capacity
    then raise exception '人數上限不可低於目前已報名人數' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function public.hr_activity_validate_capacity() from public, anon, authenticated;

drop trigger if exists hr_validate_capacity on public.qiunai_activities;
create trigger hr_validate_capacity before update of capacity on public.qiunai_activities
  for each row execute function public.hr_activity_validate_capacity('qiunai');
drop trigger if exists hr_validate_capacity on public.deepnight_activities;
create trigger hr_validate_capacity before update of capacity on public.deepnight_activities
  for each row execute function public.hr_activity_validate_capacity('deepnight');

create or replace function public.submit_qiunai_activity_response(
  p_activity_id uuid, p_discord_id text, p_status text, p_option_ids uuid[],
  p_guests jsonb, p_staff_nickname text, p_staff_real_name text, p_staff_phone text
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  activity public.qiunai_activities%rowtype;
  response public.qiunai_activity_responses%rowtype;
begin
  select * into activity from public.qiunai_activities where id = p_activity_id for update;
  if not found or not activity.is_published then raise exception '找不到活動'; end if;
  if clock_timestamp() >= activity.response_deadline then raise exception '活動報名已截止'; end if;
  if p_status is null or p_status not in ('attending', 'not_attending', 'distance')
    then raise exception '請選擇參與狀態'; end if;
  if p_status = 'not_attending' and not activity.allow_not_attending then raise exception '此活動已關閉「不參與」選項'; end if;
  if p_status = 'distance' and not activity.allow_distance then raise exception '此活動已關閉「因地區無法參與」選項'; end if;
  if p_status <> 'attending' then
    p_guests := '[]'::jsonb;
    p_option_ids := '{}'::uuid[];
  end if;
  if jsonb_typeof(p_guests) is distinct from 'array' or jsonb_array_length(p_guests) > 1
    then raise exception '每位員工最多攜帶一位親友'; end if;
  if exists (select 1 from jsonb_array_elements(p_guests) guest
    where char_length(trim(coalesce(guest->>'name', ''))) not between 1 and 100
       or char_length(trim(coalesce(guest->>'phone', ''))) not between 6 and 30)
    then raise exception '請完整填寫親友姓名與電話'; end if;
  if p_status = 'attending' and activity.capacity is not null and
    public.hr_activity_occupied('qiunai', p_activity_id, p_discord_id) + 1 + jsonb_array_length(p_guests) > activity.capacity
    then raise exception '活動剩餘名額不足' using errcode = '23514'; end if;

  insert into public.qiunai_activity_responses(
    activity_id, discord_id, response_status, selected_option_id, selected_option_ids,
    staff_nickname, staff_real_name, staff_phone, submitted_at, updated_at
  ) values (
    p_activity_id, p_discord_id, p_status, p_option_ids[1], p_option_ids,
    p_staff_nickname, p_staff_real_name, p_staff_phone, now(), now()
  )
  on conflict (activity_id, discord_id) do update set
    response_status = excluded.response_status, selected_option_id = excluded.selected_option_id,
    selected_option_ids = excluded.selected_option_ids, staff_nickname = excluded.staff_nickname,
    staff_real_name = excluded.staff_real_name, staff_phone = excluded.staff_phone,
    submitted_at = excluded.submitted_at, updated_at = excluded.updated_at
  returning * into response;

  delete from public.qiunai_activity_guests where response_id = response.id;
  insert into public.qiunai_activity_guests (response_id, slot, guest_name, guest_phone)
    select response.id, 1, trim(guest->>'name'), trim(guest->>'phone')
    from jsonb_array_elements(p_guests) guest;
  return to_jsonb(response);
end;
$$;
revoke all on function public.submit_qiunai_activity_response(uuid, text, text, uuid[], jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_qiunai_activity_response(uuid, text, text, uuid[], jsonb, text, text, text)
  to service_role;

create or replace function public.submit_deepnight_activity_response(
  p_activity_id uuid, p_discord_id text, p_status text, p_option_id uuid, p_guests jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  activity public.deepnight_activities%rowtype;
  staff public.players%rowtype;
  response public.deepnight_activity_responses%rowtype;
  completed_orders integer;
begin
  select * into activity from public.deepnight_activities where id = p_activity_id for update;
  if not found or not activity.is_published then raise exception '找不到活動'; end if;
  if clock_timestamp() >= activity.response_deadline then raise exception '活動報名已截止'; end if;
  select * into staff from public.players where discord_id = p_discord_id and is_active is distinct from false;
  if not found then raise exception '找不到有效員工資料'; end if;
  if p_status not in ('attending', 'not_attending', 'distance') or p_status is null then raise exception '請選擇參與狀態'; end if;
  if p_status = 'not_attending' and not activity.allow_not_attending then raise exception '此活動已關閉不參與選項'; end if;
  if p_status = 'distance' and not activity.allow_distance then raise exception '此活動已關閉地區選項'; end if;
  select count(*) into completed_orders from public.play_orders
    where discord_id = p_discord_id and is_deleted is distinct from true
      and (completed_at is not null or salary_paid is true or status in ('已完成', '已入帳', 'completed'));
  if p_status = 'attending' and (completed_orders < activity.min_completed_orders
    or floor(extract(epoch from (now() - staff.created_at)) / 86400) < activity.min_employment_days)
    then raise exception '你目前不符合參與門檻'; end if;
  if jsonb_typeof(p_guests) is distinct from 'array' or jsonb_array_length(p_guests) > 1 then raise exception '每位員工最多攜帶一位親友'; end if;
  if p_status <> 'attending' then
    p_option_id := null;
    p_guests := '[]'::jsonb;
  elsif exists (select 1 from public.deepnight_activity_options where activity_id = p_activity_id) and p_option_id is null then
    raise exception '請選擇活動選項';
  end if;
  if p_option_id is not null and not exists(select 1 from public.deepnight_activity_options where id = p_option_id and activity_id = p_activity_id) then
    raise exception '活動選項不屬於此活動';
  end if;
  if exists(select 1 from jsonb_array_elements(p_guests) guest where char_length(trim(coalesce(guest->>'name', ''))) not between 1 and 100
    or char_length(trim(coalesce(guest->>'phone', ''))) not between 6 and 30) then raise exception '請完整填寫親友姓名與電話'; end if;
  if p_status = 'attending' and activity.capacity is not null and
    public.hr_activity_occupied('deepnight', p_activity_id, p_discord_id) + 1 + jsonb_array_length(p_guests) > activity.capacity
    then raise exception '活動剩餘名額不足' using errcode = '23514'; end if;
  insert into public.deepnight_activity_responses(activity_id, discord_id, response_status, selected_option_id, staff_nickname, staff_real_name, staff_phone)
    values(p_activity_id, p_discord_id, p_status, p_option_id, coalesce(staff.display_name, staff.discord_name, p_discord_id), staff.real_name, staff.phone)
    on conflict(activity_id, discord_id) do update set response_status = excluded.response_status, selected_option_id = excluded.selected_option_id,
      staff_nickname = excluded.staff_nickname, staff_real_name = excluded.staff_real_name, staff_phone = excluded.staff_phone, updated_at = now()
    returning * into response;
  delete from public.deepnight_activity_guests where response_id = response.id;
  insert into public.deepnight_activity_guests(response_id, slot, guest_name, guest_phone)
    select response.id, ordinality::smallint, trim(guest->>'name'), trim(guest->>'phone')
    from jsonb_array_elements(p_guests) with ordinality as guests(guest, ordinality);
  return to_jsonb(response);
end;
$$;
revoke all on function public.submit_deepnight_activity_response(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_deepnight_activity_response(uuid, text, text, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
