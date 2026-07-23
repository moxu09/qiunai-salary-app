create extension if not exists pgcrypto;
create table if not exists public.erp_role_assignments (
  id uuid primary key default gen_random_uuid(), organization_code text not null check (organization_code in ('deepnight', 'qiunai')),
  discord_id text not null, display_name text, role text not null default 'employee' check (role in ('super_admin', 'store_manager', 'customer_service', 'employee')),
  is_active boolean not null default true, created_by text, updated_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_code, discord_id)
);
create index if not exists erp_role_assignments_org_role_idx on public.erp_role_assignments (organization_code, role, is_active);
alter table public.erp_role_assignments enable row level security;
insert into public.erp_role_assignments (organization_code, discord_id, display_name, role, is_active)
select 'deepnight', discord_id, coalesce(display_name, name), case when discord_id = '847840193859682304' or role = 'owner' then 'super_admin' else 'store_manager' end, coalesce(is_active, true) from public.admins on conflict (organization_code, discord_id) do nothing;
insert into public.erp_role_assignments (organization_code, discord_id, display_name, role, is_active)
select 'qiunai', discord_id, name, case when discord_id = '847840193859682304' then 'super_admin' else 'store_manager' end, coalesce(is_active, true) from public.qiunai_admins on conflict (organization_code, discord_id) do nothing;
update public.erp_role_assignments set role = 'super_admin', is_active = true, updated_at = now() where discord_id = '847840193859682304';

