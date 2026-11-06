begin;

create table public.hr_manager_memberships (
  organization_code text not null check (organization_code in ('qiunai', 'deepnight')),
  discord_id text not null check (discord_id ~ '^[0-9]{15,22}$' and discord_id <> '847840193859682304'),
  assigned_at timestamptz not null default now(),
  primary key (organization_code, discord_id)
);
alter table public.hr_manager_memberships enable row level security;
revoke all on public.hr_manager_memberships from public, anon, authenticated, service_role;
grant select on public.hr_manager_memberships to service_role;

-- Carry forward each department's active Managers once. Subsequent ERP role
-- changes have no effect on HR membership.
insert into public.hr_manager_memberships (organization_code, discord_id)
select staff.organization_code, staff.discord_id
from (
  select 'qiunai' as organization_code, discord_id from public.qiunai_staff where is_active is distinct from false
  union
  select 'deepnight', discord_id from public.players where is_active is distinct from false
) staff
where staff.discord_id ~ '^[0-9]{15,22}$'
  and public.hr_salary_reviewer_role(staff.organization_code, staff.discord_id) = 'Manager';

create or replace function public.hr_salary_reviewer_role(p_org text, p_actor text) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or p_org not in ('qiunai', 'deepnight') or p_actor is null then return 'Staff'; end if;
  if p_actor = '847840193859682304' then return 'PIC'; end if;
  if exists (select 1 from public.hr_manager_memberships where organization_code = p_org and discord_id = p_actor)
    and ((p_org = 'qiunai' and exists (select 1 from public.qiunai_staff where discord_id = p_actor and is_active is distinct from false))
      or (p_org = 'deepnight' and exists (select 1 from public.players where discord_id = p_actor and is_active is distinct from false))) then
    return 'Manager';
  end if;
  return 'Staff';
end $$;
grant execute on function public.hr_salary_reviewer_role(text, text) to service_role;

create or replace function public.course_is_manager(p_org text, p_actor text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.hr_salary_reviewer_role(p_org, p_actor) in ('PIC', 'Manager');
$$;

create function public.hr_set_manager(p_org text, p_actor text, p_member text, p_granted boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_actor is distinct from '847840193859682304' then
    raise exception '只有 PIC 可以管理 HR 成員' using errcode = '42501';
  end if;
  if p_org is null or p_org not in ('qiunai', 'deepnight') or p_member is null
    or p_member !~ '^[0-9]{15,22}$' or p_member = p_actor or p_granted is null then
    raise exception '成員或部門不正確' using errcode = '22023';
  end if;
  if p_granted then
    if p_org = 'qiunai' then
      perform 1 from public.qiunai_staff where discord_id = p_member and is_active is distinct from false for share;
    else
      perform 1 from public.players where discord_id = p_member and is_active is distinct from false for share;
    end if;
    if not found then raise exception '找不到此部門的在職員工' using errcode = 'P0002'; end if;
    insert into public.hr_manager_memberships (organization_code, discord_id)
      values (p_org, p_member) on conflict do nothing;
  else
    delete from public.hr_manager_memberships where organization_code = p_org and discord_id = p_member;
  end if;
end $$;
revoke all on function public.hr_set_manager(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.hr_set_manager(text, text, text, boolean) to service_role;

-- Older clients can write the same approvals. Protect single-stage decisions
-- as well as the existing two-stage triggers, using the same role resolver.
create function public.hr_guard_single_stage_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  role text;
begin
  if new.status not in ('approved', 'rejected') then return new; end if;
  if tg_table_name = 'eip_workflow_requests' then
    if old.approval_steps = '["manager","owner"]'::jsonb then return new; end if;
    if (new.status, new.decided_by, new.decided_at, new.decision_note) is not distinct from
       (old.status, old.decided_by, old.decided_at, old.decision_note) then return new; end if;
    role := public.hr_salary_reviewer_role(old.organization_code, new.decided_by);
    if old.status <> 'pending' or new.decided_by = old.applicant_discord_id
      or role = 'Staff' or (old.approval_steps = '["owner"]'::jsonb and role <> 'PIC') then
      raise exception '你沒有處理此 HR 簽核的權限' using errcode = '42501';
    end if;
  else
    if old.organization_code is null or old.organization_code not in ('qiunai', 'deepnight') then return new; end if;
    if (new.status, new.reviewed_by, new.reviewed_at, new.review_result) is not distinct from
       (old.status, old.reviewed_by, old.reviewed_at, old.review_result) then return new; end if;
    role := public.hr_salary_reviewer_role(old.organization_code, new.reviewed_by);
    if old.status <> 'pending' or new.reviewed_by = old.discord_id or role = 'Staff' then
      raise exception '你沒有處理此 HR 簽核的權限' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.hr_guard_single_stage_review() from public, anon, authenticated;
create trigger hr_guard_single_stage_workflow_review before update on public.eip_workflow_requests
for each row execute function public.hr_guard_single_stage_review();
create trigger hr_guard_single_stage_personnel_review before update on public.salary_requests
for each row execute function public.hr_guard_single_stage_review();

notify pgrst, 'reload schema';
commit;
