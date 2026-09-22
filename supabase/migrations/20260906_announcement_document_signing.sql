alter table public.salary_announcements
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_sha256 text,
  add column if not exists requires_signature boolean not null default false,
  add column if not exists audience_discord_ids text[] not null default '{}',
  add column if not exists signature_deadline timestamptz,
  add column if not exists document_version integer not null default 1;

create table if not exists public.salary_announcement_signatures (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.salary_announcements(id) on delete cascade,
  organization_code text not null check (organization_code in ('deepnight', 'qiunai')),
  discord_id text not null,
  status text not null default 'opened' check (status in ('opened', 'read', 'signing', 'signed')),
  opened_at timestamptz not null default now(),
  read_confirmed_at timestamptz,
  signed_at timestamptz,
  signed_pdf_path text,
  source_pdf_sha256 text,
  signed_pdf_sha256 text,
  evidence_hmac text,
  signer_auth_user_id uuid,
  signer_user_agent text,
  signer_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, discord_id)
);

create index if not exists salary_announcement_signatures_admin_idx
  on public.salary_announcement_signatures (organization_code, announcement_id, status);
create index if not exists salary_announcement_signatures_staff_idx
  on public.salary_announcement_signatures (organization_code, discord_id, created_at desc);

alter table public.salary_announcement_signatures enable row level security;
revoke all on table public.salary_announcement_signatures from anon, authenticated;
grant all on table public.salary_announcement_signatures to service_role;
