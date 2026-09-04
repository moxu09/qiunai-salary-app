create extension if not exists pgcrypto;

create table if not exists public.employment_contract_signings (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('deepnight', 'qiunai')),
  discord_id text not null,
  discord_name text not null,
  token_hash text not null unique,
  contract_version text not null default 'v1.1',
  status text not null default 'invited'
    check (status in ('invited', 'opened', 'read', 'signing', 'signed', 'activated', 'revoked', 'expired')),
  expires_at timestamptz not null,
  opened_at timestamptz,
  read_confirmed_at timestamptz,
  signed_at timestamptz,
  activated_at timestamptz,
  form_data jsonb not null default '{}'::jsonb,
  signed_pdf_path text,
  signed_pdf_sha256 text,
  contract_sha256 text,
  verification_method text not null default 'discord_oauth_and_handwritten_signature',
  evidence_hmac text,
  signer_auth_user_id uuid,
  signer_user_agent text,
  signer_ip_hash text,
  invited_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employment_contract_signings_lookup_idx
  on public.employment_contract_signings (organization_code, discord_id, created_at desc);

create index if not exists employment_contract_signings_pending_idx
  on public.employment_contract_signings (organization_code, discord_id, status)
  where activated_at is null;

alter table public.employment_contract_signings enable row level security;
revoke all on public.employment_contract_signings from anon, authenticated;

comment on table public.employment_contract_signings is
  'Server-only employment contract invitation, signing audit, and first EIP login activation records.';
comment on column public.employment_contract_signings.form_data is
  'EIP onboarding fields only. National ID, contact details, and handwritten signature are stored only inside the signed PDF.';

alter table public.employment_contract_signings
  add column if not exists verification_method text not null default 'discord_oauth_and_handwritten_signature',
  add column if not exists evidence_hmac text;
