-- Apply to the shared EIP Supabase project before enabling
-- EIP_WORKFLOW_MULTISTAGE_ENABLED on either service. Existing single-stage
-- requests keep their original approver role and remain pending as before.
begin;

alter table public.eip_workflow_templates
  add column if not exists approval_steps jsonb;
update public.eip_workflow_templates
set approval_steps = case when approver_role = 'owner'
  then '["owner"]'::jsonb else '["manager"]'::jsonb end
where approval_steps is null;
alter table public.eip_workflow_templates
  alter column approval_steps drop default,
  alter column approval_steps set not null;

alter table public.eip_workflow_requests
  add column if not exists approval_steps jsonb;
update public.eip_workflow_requests as request
set approval_steps = coalesce(template.approval_steps,
  case when template.approver_role = 'owner' then '["owner"]'::jsonb
    else '["manager"]'::jsonb end)
from public.eip_workflow_templates as template
where request.template_id = template.id and request.approval_steps is null;
alter table public.eip_workflow_requests
  alter column approval_steps drop default,
  alter column approval_steps set not null,
  add column if not exists approval_step_index integer not null default 0,
  add column if not exists first_approved_by text,
  add column if not exists first_approved_at timestamptz,
  add column if not exists first_approval_note text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'eip_workflow_templates_steps_valid') then
    alter table public.eip_workflow_templates add constraint eip_workflow_templates_steps_valid
      check (approval_steps in ('["manager"]'::jsonb, '["owner"]'::jsonb, '["manager","owner"]'::jsonb));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eip_workflow_requests_steps_valid') then
    alter table public.eip_workflow_requests add constraint eip_workflow_requests_steps_valid
      check (approval_steps in ('["manager"]'::jsonb, '["owner"]'::jsonb, '["manager","owner"]'::jsonb)
        and approval_step_index >= 0
        and approval_step_index < jsonb_array_length(approval_steps)
        and (approval_step_index = 0 or first_approved_by is not null));
  end if;
end $$;

alter table public.eip_workflow_audit
  add column if not exists step_index integer;

-- Legacy application versions omit approval_steps. Derive them in the database
-- so an owner-only template cannot silently become manager-approved during rollout.
create or replace function public.eip_workflow_snapshot_steps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'eip_workflow_templates' then
    if new.approval_steps is null then
      new.approval_steps := case when new.approver_role = 'owner'
        then '["owner"]'::jsonb else '["manager"]'::jsonb end;
    end if;
  elsif new.approval_steps is null then
    select approval_steps into new.approval_steps
    from public.eip_workflow_templates
    where id = new.template_id and organization_code = new.organization_code;
    if new.approval_steps is null then
      raise exception 'workflow template not found for request';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists eip_workflow_template_snapshot_steps on public.eip_workflow_templates;
create trigger eip_workflow_template_snapshot_steps
  before insert on public.eip_workflow_templates
  for each row execute function public.eip_workflow_snapshot_steps();
drop trigger if exists eip_workflow_request_snapshot_steps on public.eip_workflow_requests;
create trigger eip_workflow_request_snapshot_steps
  before insert on public.eip_workflow_requests
  for each row execute function public.eip_workflow_snapshot_steps();
revoke all on function public.eip_workflow_snapshot_steps() from public, anon, authenticated;

create or replace function public.eip_workflow_record_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.eip_workflow_audit
      (request_id, organization_code, old_status, new_status, actor_discord_id, note, step_index)
    values(new.id, new.organization_code, old.status, new.status,
      coalesce(new.decided_by, ''), new.decision_note, old.approval_step_index);
  elsif new.approval_step_index is distinct from old.approval_step_index then
    insert into public.eip_workflow_audit
      (request_id, organization_code, old_status, new_status, actor_discord_id, note, step_index)
    values(new.id, new.organization_code, old.status, new.status,
      coalesce(new.first_approved_by, ''), new.first_approval_note, old.approval_step_index);
  end if;
  return new;
end;
$$;
drop trigger if exists eip_workflow_decision_audit on public.eip_workflow_requests;
create trigger eip_workflow_decision_audit
  after update of status, approval_step_index on public.eip_workflow_requests
  for each row execute function public.eip_workflow_record_decision();
revoke all on function public.eip_workflow_record_decision() from public, anon, authenticated;

commit;
