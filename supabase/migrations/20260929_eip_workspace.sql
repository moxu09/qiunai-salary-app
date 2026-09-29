-- Shared EIP collaboration data. All employee access goes through authenticated,
-- organisation-scoped server routes; browser clients receive no table grants.
create extension if not exists pgcrypto;

create table if not exists public.eip_workspace_events (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('qiunai','deepnight')),
  title text not null check (char_length(title) between 1 and 120),
  details text not null default '' check (char_length(details) <= 5000),
  location text not null default '' check (char_length(location) <= 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_published boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eip_workspace_events_time check (ends_at > starts_at)
);
create index if not exists eip_workspace_events_org_time on public.eip_workspace_events (organization_code, starts_at);

create table if not exists public.eip_workspace_documents (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('qiunai','deepnight')),
  document_type text not null check (document_type in ('document','knowledge')),
  category text not null default '一般' check (char_length(category) between 1 and 50),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 30000),
  is_published boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists eip_workspace_documents_org_type on public.eip_workspace_documents (organization_code, document_type, updated_at desc);
create table if not exists public.eip_workspace_document_revisions (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.eip_workspace_documents(id),
  organization_code text not null,
  version integer not null,
  title text not null,
  body text not null,
  category text not null,
  is_published boolean not null,
  changed_at timestamptz not null default now(),
  unique(document_id, version)
);
create or replace function public.eip_workspace_save_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.eip_workspace_document_revisions
    (document_id, organization_code, version, title, body, category, is_published)
  values(old.id, old.organization_code, old.version, old.title, old.body, old.category, old.is_published);
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists eip_workspace_document_revision on public.eip_workspace_documents;
create trigger eip_workspace_document_revision before update on public.eip_workspace_documents
for each row execute function public.eip_workspace_save_revision();

create table if not exists public.eip_workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('qiunai','deepnight')),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  approver_role text not null default 'manager' check (approver_role in ('manager','owner')),
  is_active boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists eip_workflow_templates_org_active on public.eip_workflow_templates (organization_code, is_active);

create table if not exists public.eip_workflow_requests (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('qiunai','deepnight')),
  template_id uuid not null references public.eip_workflow_templates(id),
  applicant_discord_id text not null,
  applicant_name text not null,
  form_data jsonb not null check (jsonb_typeof(form_data) = 'object'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by text,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists eip_workflow_requests_org_status on public.eip_workflow_requests (organization_code, status, created_at desc);
create index if not exists eip_workflow_requests_applicant on public.eip_workflow_requests (organization_code, applicant_discord_id, created_at desc);

create table if not exists public.eip_workflow_audit (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.eip_workflow_requests(id),
  organization_code text not null,
  old_status text not null,
  new_status text not null,
  actor_discord_id text not null,
  note text,
  created_at timestamptz not null default now()
);
create or replace function public.eip_workflow_record_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.eip_workflow_audit(request_id, organization_code, old_status, new_status, actor_discord_id, note)
    values(new.id, new.organization_code, old.status, new.status, coalesce(new.decided_by, ''), new.decision_note);
  end if;
  return new;
end;
$$;
drop trigger if exists eip_workflow_decision_audit on public.eip_workflow_requests;
create trigger eip_workflow_decision_audit after update of status on public.eip_workflow_requests
for each row execute function public.eip_workflow_record_decision();

do $$
declare table_name text;
begin
  foreach table_name in array array['eip_workspace_events','eip_workspace_documents','eip_workspace_document_revisions','eip_workflow_templates','eip_workflow_requests','eip_workflow_audit'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;
revoke all on function public.eip_workflow_record_decision() from public, anon, authenticated;
revoke all on function public.eip_workspace_save_revision() from public, anon, authenticated;
revoke all on sequence public.eip_workflow_audit_id_seq from public, anon, authenticated;
revoke all on sequence public.eip_workspace_document_revisions_id_seq from public, anon, authenticated;
grant usage, select on sequence public.eip_workflow_audit_id_seq to service_role;
grant usage, select on sequence public.eip_workspace_document_revisions_id_seq to service_role;
