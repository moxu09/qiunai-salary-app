begin;

alter table public.salary_requests
  add column if not exists first_reviewed_by text,
  add column if not exists first_reviewed_at timestamptz,
  add column if not exists first_review_note text;

create function public.hr_salary_reviewer_role(p_org text, p_actor text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  assignment public.erp_role_assignments%rowtype;
  legacy jsonb;
begin
  if p_actor is null or p_org not in ('deepnight', 'qiunai') then return 'Staff'; end if;
  if (p_org = 'qiunai' and exists (select 1 from public.qiunai_staff where discord_id = p_actor and is_active = false))
    or (p_org = 'deepnight' and exists (select 1 from public.players where discord_id = p_actor and is_active = false)) then
    return 'Staff';
  end if;
  if p_actor = '847840193859682304' then return 'PIC'; end if;
  select * into assignment from public.erp_role_assignments
    where organization_code = p_org and discord_id = p_actor;
  if found then
    if not assignment.is_active then return 'Staff'; end if;
    return case assignment.role when 'super_admin' then 'PIC' when 'store_manager' then 'Manager' else 'Staff' end;
  end if;
  if p_org = 'qiunai' then
    select to_jsonb(a) into legacy from public.qiunai_admins a
      where a.discord_id = p_actor and a.is_active = true limit 1;
  else
    select to_jsonb(a) into legacy from public.admins a
      where a.discord_id = p_actor and a.is_active = true limit 1;
  end if;
  return case when legacy is null then 'Staff' when legacy->>'role' = 'owner' then 'PIC' else 'Manager' end;
end $$;
revoke all on function public.hr_salary_reviewer_role(text, text) from public, anon, authenticated;

create function public.hr_guard_salary_request_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  money boolean;
  first_changed boolean;
begin
  money := coalesce(old.approval_category in ('reimbursement', 'welfare'), false)
    or coalesce(old.request_group = 'welfare', false)
    or coalesce(old.request_type in ('查掛津貼', '代支報銷', '證照津貼申請書', '逾期補登單申請書'), false);
  first_changed := (new.first_reviewed_by, new.first_reviewed_at, new.first_review_note)
    is distinct from (old.first_reviewed_by, old.first_reviewed_at, old.first_review_note);
  if not money then
    if first_changed then raise exception '只有金錢申請可登記初核' using errcode = '23514'; end if;
    return new;
  end if;
  if (new.organization_code, new.discord_id, new.request_group, new.approval_category, new.request_type)
    is distinct from (old.organization_code, old.discord_id, old.request_group, old.approval_category, old.request_type) then
    raise exception '不可變更金錢申請的部門、申請人或類別' using errcode = '23514';
  end if;
  if first_changed and (
    old.status <> 'pending' or new.status <> 'pending' or old.first_reviewed_at is not null
    or new.first_reviewed_at is null or new.first_reviewed_by is null
    or new.first_reviewed_by = old.discord_id
    or public.hr_salary_reviewer_role(old.organization_code, new.first_reviewed_by) <> 'Manager'
  ) then
    raise exception '金錢申請須由 Manager 初核' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status not in ('approved','rejected') or new.reviewed_by is null
      or new.reviewed_at is null or new.reviewed_by = old.discord_id
      or (new.status = 'rejected' and coalesce(btrim(new.review_result), '') = '') then
      raise exception '此金錢申請的簽核狀態不正確' using errcode = '23514';
    end if;
    if old.first_reviewed_at is null then
      if new.status <> 'rejected' or public.hr_salary_reviewer_role(old.organization_code, new.reviewed_by) <> 'Manager' then
        raise exception '金錢申請須先由 Manager 初核' using errcode = '23514';
      end if;
    elsif new.reviewed_by = old.first_reviewed_by
      or public.hr_salary_reviewer_role(old.organization_code, new.reviewed_by) <> 'PIC' then
      raise exception '金錢申請須由另一位 PIC 覆核' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.hr_guard_salary_request_review() from public, anon, authenticated;
create trigger hr_guard_salary_request_review
  before update on public.salary_requests
  for each row execute function public.hr_guard_salary_request_review();

-- Keep the same two-stage boundary when older workspace clients write directly.
create function public.hr_guard_two_stage_workspace_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.approval_steps <> '["manager","owner"]'::jsonb then return new; end if;
  if (new.approval_steps, new.applicant_discord_id, new.organization_code)
    is distinct from (old.approval_steps, old.applicant_discord_id, old.organization_code) then
    raise exception '不可變更已送出申請的簽核流程' using errcode = '23514';
  end if;
  if new.approval_step_index is distinct from old.approval_step_index then
    if old.status <> 'pending' or new.status <> 'pending'
      or old.approval_step_index <> 0 or new.approval_step_index <> 1
      or new.first_approved_at is null or new.first_approved_by is null
      or new.first_approved_by = old.applicant_discord_id
      or public.hr_salary_reviewer_role(old.organization_code, new.first_approved_by) <> 'Manager' then
      raise exception '須由 Manager 初核後送交 PIC' using errcode = '23514';
    end if;
  elsif (new.first_approved_by, new.first_approved_at, new.first_approval_note)
    is distinct from (old.first_approved_by, old.first_approved_at, old.first_approval_note) then
    raise exception '不可修改已登記的初核紀錄' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status not in ('approved','rejected') or new.decided_by is null
      or new.decided_at is null or new.decided_by = old.applicant_discord_id
      or (new.status = 'rejected' and coalesce(btrim(new.decision_note), '') = '') then
      raise exception '此金錢申請的簽核狀態不正確' using errcode = '23514';
    end if;
    if old.approval_step_index = 0 then
      if new.status <> 'rejected' or public.hr_salary_reviewer_role(old.organization_code, new.decided_by) <> 'Manager' then
        raise exception '須由 Manager 初核' using errcode = '23514';
      end if;
    elsif new.decided_by = old.first_approved_by
      or public.hr_salary_reviewer_role(old.organization_code, new.decided_by) <> 'PIC' then
      raise exception '須由另一位 PIC 覆核' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.hr_guard_two_stage_workspace_review() from public, anon, authenticated;
create trigger hr_guard_two_stage_workspace_review
  before update on public.eip_workflow_requests
  for each row execute function public.hr_guard_two_stage_workspace_review();

notify pgrst, 'reload schema';
commit;
