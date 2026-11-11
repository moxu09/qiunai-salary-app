begin;
set local lock_timeout = '5s';

create table public.hr_document_signings (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null check (discord_id ~ '^[0-9]{15,22}$'),
  document_key text not null check (document_key in ('employment-v22', 'manager-nda')),
  organization_code text not null check (organization_code in ('qiunai', 'deepnight')),
  attempt_id uuid not null,
  started_at timestamptz not null default now(),
  signed_at timestamptz,
  signed_pdf_path text,
  signed_pdf_sha256 text,
  source_sha256 text,
  evidence_hmac text,
  signer_identity text check (signer_identity in ('tw', 'cn_hk_mo', 'foreign')),
  deposit_required boolean not null default false,
  deposit_paid_at timestamptz,
  unique (discord_id, document_key)
);

create table public.hr_contract_profiles (
  discord_id text primary key check (discord_id ~ '^[0-9]{15,22}$'),
  national_id_encrypted text not null,
  signer_identity text not null check (signer_identity in ('tw', 'cn_hk_mo', 'foreign')),
  bank_holder text,
  bank_code text check (bank_code ~ '^[0-9]{3}$'),
  payout_channel text,
  updated_at timestamptz not null default now(),
  check ((signer_identity = 'tw' and bank_holder is not null and bank_code is not null and payout_channel is null)
    or (signer_identity <> 'tw' and bank_holder is null and bank_code is null and payout_channel is not null))
);

create table public.hr_contract_invitations (
  discord_id text not null check (discord_id ~ '^[0-9]{15,22}$'),
  organization_code text not null check (organization_code in ('qiunai', 'deepnight')),
  discord_name text not null,
  invited_by text not null check (invited_by ~ '^[0-9]{15,22}$'),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  primary key (discord_id, organization_code)
);

alter table public.hr_contract_invitations enable row level security;
revoke all on public.hr_contract_invitations from public, anon, authenticated, service_role;
grant select, insert, update on public.hr_contract_invitations to service_role;

alter table public.hr_document_signings enable row level security;
alter table public.hr_contract_profiles enable row level security;
revoke all on public.hr_document_signings, public.hr_contract_profiles from public, anon, authenticated, service_role;
grant select on public.hr_document_signings, public.hr_contract_profiles to service_role;

create table public.hr_contract_deposit_waivers (
  organization_code text not null check (organization_code in ('qiunai', 'deepnight')),
  staff_id text not null,
  discord_id text not null check (discord_id ~ '^[0-9]{15,22}$'),
  primary key (organization_code, staff_id)
);
create index hr_contract_deposit_waivers_discord_idx on public.hr_contract_deposit_waivers(discord_id);
alter table public.hr_contract_deposit_waivers enable row level security;
revoke all on public.hr_contract_deposit_waivers from public, anon, authenticated, service_role;

create function public.hr_track_contract_deposit_waiver()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  org text := case when tg_table_name = 'players' then 'deepnight' else 'qiunai' end;
begin
  if statement_timestamp() >= timestamptz '2026-12-01 00:00:00+08' then return null; end if;
  if tg_op <> 'INSERT' then
    delete from public.hr_contract_deposit_waivers
    where organization_code = org and staff_id = old.id::text;
  end if;
  if tg_op = 'DELETE' then return null; end if;
  if org = 'deepnight' then
    if new.guild_id::text is distinct from '1501098191813214312' then return null; end if;
  end if;
  if new.is_active is distinct from false
    and new.created_at < timestamptz '2026-12-01 00:00:00+08'
    and new.discord_id ~ '^[0-9]{15,22}$' then
    insert into public.hr_contract_deposit_waivers(organization_code, staff_id, discord_id)
    values (org, new.id::text, new.discord_id)
    on conflict (organization_code, staff_id) do update set discord_id = excluded.discord_id;
  end if;
  return null;
end;
$$;
revoke all on function public.hr_track_contract_deposit_waiver()
  from public, anon, authenticated, service_role;

-- Track roster changes until midnight Taipei time, then keep that roster for both stores.
create trigger hr_track_contract_waiver_qiunai
  after insert or delete or update of id, discord_id, created_at, is_active on public.qiunai_staff
  for each row execute function public.hr_track_contract_deposit_waiver();
create trigger hr_track_contract_waiver_deepnight
  after insert or delete or update of id, discord_id, created_at, is_active, guild_id on public.players
  for each row execute function public.hr_track_contract_deposit_waiver();

insert into public.hr_contract_deposit_waivers(organization_code, staff_id, discord_id)
select 'qiunai', id::text, discord_id from public.qiunai_staff
where is_active is distinct from false and created_at < timestamptz '2026-12-01 00:00:00+08'
  and discord_id ~ '^[0-9]{15,22}$'
union all
select 'deepnight', id::text, discord_id from public.players
where guild_id::text = '1501098191813214312' and is_active is distinct from false
  and created_at < timestamptz '2026-12-01 00:00:00+08' and discord_id ~ '^[0-9]{15,22}$';

create function public.hr_contract_existing_staff_waiver(p_discord_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hr_contract_deposit_waivers where discord_id = p_discord_id);
$$;
revoke all on function public.hr_contract_existing_staff_waiver(text)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_contract_existing_staff_waiver(text) to service_role;

create function public.hr_claim_document_signing(p_discord_id text, p_document_key text, p_org text, p_attempt uuid)
returns uuid language sql security definer set search_path = '' as $$
  insert into public.hr_document_signings as signing (discord_id, document_key, organization_code, attempt_id)
  values (p_discord_id, p_document_key, p_org, p_attempt)
  on conflict (discord_id, document_key) do update set
    attempt_id = excluded.attempt_id,
    organization_code = excluded.organization_code,
    started_at = now()
  where signing.signed_at is null and signing.started_at < now() - interval '5 minutes'
  returning id;
$$;

create function public.hr_release_document_signing(p_id uuid, p_attempt uuid)
returns void language sql security definer set search_path = '' as $$
  update public.hr_document_signings set started_at = '-infinity'
  where id = p_id and attempt_id = p_attempt and signed_at is null;
$$;

create function public.hr_complete_document_signing(
  p_id uuid, p_attempt uuid, p_discord_id text, p_discord_name text, p_auth_user_id uuid,
  p_signed_at timestamptz, p_pdf_path text, p_pdf_sha256 text, p_source_sha256 text,
  p_evidence_hmac text, p_profile jsonb, p_departments text[], p_token_hash text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  signing public.hr_document_signings%rowtype;
  identity_type text := p_profile->>'signer_identity';
  v_deposit_required boolean := coalesce((p_profile->>'deposit_required')::boolean, false);
begin
  if identity_type is null or identity_type not in ('tw', 'cn_hk_mo', 'foreign') then
    raise exception '請選擇簽署身分';
  end if;
  select * into signing from public.hr_document_signings
  where id = p_id and attempt_id = p_attempt and discord_id = p_discord_id and signed_at is null
  for update;
  if not found then raise exception '簽署已由其他請求處理'; end if;
  if signing.document_key = 'manager-nda' then
    if p_source_sha256 <> '280442e5e13d36f01e5308550a9af728cd3339b5d9f846280e529a7daf82e643' then
      raise exception '保密協議原稿版本不符';
    end if;
    if not exists (
      select 1 from unnest(p_departments) as dept(code)
      where public.hr_salary_reviewer_role(dept.code, p_discord_id) = 'Manager'
    ) then raise exception '只有現任 Manager 可以簽署此保密協議'; end if;
  else
    if p_profile->>'birthday' is null
      or v_deposit_required is distinct from (
        (p_profile->>'birthday')::date <= ((p_signed_at at time zone 'Asia/Taipei')::date - interval '18 years')::date
        and not public.hr_contract_existing_staff_waiver(p_discord_id)
      ) then raise exception '履約保證金適用狀態不符'; end if;
    if p_source_sha256 <> 'abca0bf344776cd05038efe701b93f3c2577c8da38990c0f91fa4347668b2afe' then
      raise exception '契約原稿版本不符';
    end if;
    insert into public.employment_contract_signings (
      id, organization_code, discord_id, discord_name, token_hash, contract_version, status,
      expires_at, opened_at, read_confirmed_at, signed_at, form_data, signed_pdf_path,
      signed_pdf_sha256, contract_sha256, evidence_hmac, signer_auth_user_id
    ) values (
      p_id, signing.organization_code, p_discord_id, p_discord_name, p_token_hash, 'v2.2',
      case when v_deposit_required then 'signing' else 'signed' end,
      p_signed_at + interval '7 days', signing.started_at, p_signed_at, p_signed_at,
      p_profile - 'national_id_encrypted' - 'deposit_required', p_pdf_path, p_pdf_sha256, p_source_sha256, p_evidence_hmac, p_auth_user_id
    );
    insert into public.hr_contract_profiles(discord_id, national_id_encrypted, signer_identity, bank_holder, bank_code, payout_channel)
    values (p_discord_id, p_profile->>'national_id_encrypted', identity_type,
      p_profile->>'bank_holder', p_profile->>'bank_code', p_profile->>'payout_channel')
    on conflict (discord_id) do update set national_id_encrypted = excluded.national_id_encrypted,
      signer_identity = excluded.signer_identity, bank_holder = excluded.bank_holder,
      bank_code = excluded.bank_code, payout_channel = excluded.payout_channel, updated_at = now();
    if 'qiunai' = any(p_departments) then
      update public.qiunai_staff
      set real_name = p_profile->>'real_name', phone = p_profile->>'phone',
        birthday = (p_profile->>'birthday')::date,
        bank_name = case when identity_type = 'tw' then p_profile->>'bank_name' else bank_name end,
        bank_account = case when identity_type = 'tw' then p_profile->>'bank_account' else bank_account end,
        updated_at = now()
      where discord_id = p_discord_id and is_active is distinct from false;
    end if;
    if 'deepnight' = any(p_departments) then
      update public.players
      set real_name = p_profile->>'real_name', phone = p_profile->>'phone',
        birthday = (p_profile->>'birthday')::date,
        bank_name = case when identity_type = 'tw' then p_profile->>'bank_name' else bank_name end,
        bank_code = case when identity_type = 'tw' then p_profile->>'bank_code' else bank_code end,
        bank_holder = case when identity_type = 'tw' then p_profile->>'bank_holder' else bank_holder end,
        bank_account = case when identity_type = 'tw' then p_profile->>'bank_account' else bank_account end,
        updated_at = now()
      where discord_id = p_discord_id and guild_id::text = '1501098191813214312' and is_active is distinct from false;
    end if;
  end if;

  update public.hr_document_signings set signer_identity = identity_type, signed_at = p_signed_at, signed_pdf_path = p_pdf_path,
    signed_pdf_sha256 = p_pdf_sha256, source_sha256 = p_source_sha256, evidence_hmac = p_evidence_hmac,
    deposit_required = signing.document_key = 'employment-v22' and v_deposit_required
  where id = p_id;
end;
$$;

revoke all on function public.hr_claim_document_signing(text,text,text,uuid),
  public.hr_release_document_signing(uuid,uuid),
  public.hr_complete_document_signing(uuid,uuid,text,text,uuid,timestamptz,text,text,text,text,jsonb,text[],text)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_claim_document_signing(text,text,text,uuid),
  public.hr_release_document_signing(uuid,uuid),
  public.hr_complete_document_signing(uuid,uuid,text,text,uuid,timestamptz,text,text,text,text,jsonb,text[],text)
  to service_role;
create function public.hr_apply_signed_profile_on_staff_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  profile jsonb;
begin
  if tg_table_name = 'players' then
    if new.guild_id::text is distinct from '1501098191813214312' then return new; end if;
  end if;
  select form_data into profile from public.employment_contract_signings
  where discord_id = new.discord_id and contract_version = 'v2.2' and status in ('signed', 'activated')
  order by signed_at desc nulls last limit 1;
  if profile is not null then
    new.phone := coalesce(nullif(profile->>'phone', ''), new.phone);
    if tg_table_name = 'players' then
      new.bank_code := coalesce(nullif(profile->>'bank_code', ''), new.bank_code);
      new.bank_holder := coalesce(nullif(profile->>'bank_holder', ''), new.bank_holder);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.hr_apply_signed_profile_on_staff_insert() from public, anon, authenticated, service_role;
create trigger hr_apply_signed_profile_on_qiunai_staff_insert
  before insert on public.qiunai_staff for each row execute function public.hr_apply_signed_profile_on_staff_insert();
create trigger hr_apply_signed_profile_on_players_insert
  before insert on public.players for each row execute function public.hr_apply_signed_profile_on_staff_insert();

notify pgrst, 'reload schema';
commit;
