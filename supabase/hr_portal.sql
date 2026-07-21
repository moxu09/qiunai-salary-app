create table if not exists public.salary_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('deepnight', 'qiunai', 'xy', 'all')),
  title text not null,
  content text not null,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.salary_requests (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('deepnight', 'qiunai')),
  guild_id text,
  discord_id text not null,
  staff_name text not null,
  department text not null,
  application_date date not null,
  needed_date date,
  urgency text not null default '一般' check (urgency in ('一般', '急件')),
  request_group text not null check (request_group in ('administrative', 'welfare', 'leave')),
  approval_category text not null check (approval_category in ('administrative', 'reimbursement', 'welfare', 'leave', 'suspension')),
  request_type text not null,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_result text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists salary_requests_staff_month_idx
  on public.salary_requests (organization_code, discord_id, application_date desc);

create index if not exists salary_requests_approval_month_idx
  on public.salary_requests (organization_code, approval_category, application_date desc, status);

create index if not exists salary_announcements_active_idx
  on public.salary_announcements (organization_code, is_active, created_at desc);

alter table public.salary_announcements enable row level security;
alter table public.salary_requests enable row level security;

revoke all on table public.salary_announcements from anon, authenticated;
revoke all on table public.salary_requests from anon, authenticated;
grant all on table public.salary_announcements to service_role;
grant all on table public.salary_requests to service_role;
