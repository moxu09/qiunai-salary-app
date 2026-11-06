begin;

alter table public.eip_workspace_events add column if not exists archived_at timestamptz;
alter table public.eip_workspace_documents add column if not exists archived_at timestamptz;
alter table public.eip_workflow_templates
  add column if not exists archived_at timestamptz,
  add column if not exists is_monetary boolean not null default false;
alter table public.eip_workflow_requests add column if not exists template_updated_at timestamptz;

alter table public.eip_workflow_templates add constraint eip_money_template_two_stages
  check (not is_monetary or approval_steps = '["manager","owner"]'::jsonb);

alter table public.eip_workspace_events add constraint eip_archived_event_unpublished
  check (archived_at is null or not is_published);
alter table public.eip_workspace_documents add constraint eip_archived_document_unpublished
  check (archived_at is null or not is_published);
alter table public.eip_workflow_templates add constraint eip_archived_template_disabled
  check (archived_at is null or not is_active);

-- Requests keep their original field definitions and approval path. A form
-- already used by a request can still be renamed, disabled or archived.
create function public.eip_keep_used_workflow_template() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.fields, new.approver_role, new.approval_steps) is distinct from
     (old.fields, old.approver_role, old.approval_steps)
     and exists (select 1 from public.eip_workflow_requests
       where template_id = old.id and organization_code = old.organization_code) then
    raise exception '此流程已有申請，請停用後建立新版以修改欄位或簽核關卡' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.eip_keep_used_workflow_template() from public, anon, authenticated;
create trigger eip_keep_used_workflow_template before update of fields, approver_role, approval_steps
  on public.eip_workflow_templates for each row execute function public.eip_keep_used_workflow_template();

-- Lock the template while creating the request. The submitted fields must
-- correspond to the same template version that the applicant received.
create or replace function public.eip_workflow_snapshot_steps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  template public.eip_workflow_templates%rowtype;
begin
  if tg_table_name = 'eip_workflow_templates' then
    if new.approval_steps is null then
      new.approval_steps := case when new.approver_role = 'owner'
        then '["owner"]'::jsonb else '["manager"]'::jsonb end;
    end if;
    return new;
  end if;
  select * into template from public.eip_workflow_templates
    where id = new.template_id and organization_code = new.organization_code
    for share;
  if not found or not template.is_active or template.archived_at is not null then
    raise exception '此簽核表單已停止受理' using errcode = '23514';
  end if;
  if new.approval_steps is not null and new.approval_steps <> template.approval_steps then
    raise exception '簽核關卡已更新，請重新整理' using errcode = '23514';
  end if;
  if new.template_updated_at is not null and new.template_updated_at <> template.updated_at then
    raise exception '簽核表單已更新，請重新整理' using errcode = '23514';
  end if;
  new.template_updated_at := template.updated_at;
  new.approval_steps := template.approval_steps;
  return new;
end $$;

create function public.archive_hr_course(p_org text, p_actor text, p_id uuid, p_version integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.course_is_manager(p_org, p_actor) then
    raise exception '沒有管理課程的權限' using errcode = '42501';
  end if;
  -- Keep the document and learning history. Stop publication in both tables.
  update public.eip_workspace_documents d set is_published = false, archived_at = now()
    where d.organization_code = p_org and d.id = p_id and d.version = p_version
      and d.archived_at is null and exists (
        select 1 from public.service_course_links l
        where l.organization_code = p_org and l.document_id = d.id);
  if not found then return false; end if;
  update public.service_course_links set is_published = false
    where organization_code = p_org and document_id = p_id;
  if not found then raise exception '找不到課程'; end if;
  return true;
end $$;
revoke all on function public.archive_hr_course(text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.archive_hr_course(text, text, uuid, integer) to service_role;

create function public.guard_archived_course_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_published and exists (
    select 1 from public.eip_workspace_documents where id = new.document_id and archived_at is not null
  ) then
    raise exception '課程已移除' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.guard_archived_course_link() from public, anon, authenticated;
create trigger guard_archived_course_link before insert or update on public.service_course_links
  for each row execute function public.guard_archived_course_link();

notify pgrst, 'reload schema';
commit;
