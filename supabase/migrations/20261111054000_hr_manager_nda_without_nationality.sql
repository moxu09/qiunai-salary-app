begin;
set local lock_timeout = '5s';

create or replace function public.hr_complete_document_signing(
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
  select * into signing from public.hr_document_signings
  where id = p_id and attempt_id = p_attempt and discord_id = p_discord_id and signed_at is null
  for update;
  if not found then raise exception '簽署已由其他請求處理'; end if;
  if signing.document_key = 'manager-nda' then
    identity_type := null;
    if p_source_sha256 <> '280442e5e13d36f01e5308550a9af728cd3339b5d9f846280e529a7daf82e643' then
      raise exception '保密協議原稿版本不符';
    end if;
    if not exists (
      select 1 from unnest(p_departments) as dept(code)
      where public.hr_salary_reviewer_role(dept.code, p_discord_id) = 'Manager'
    ) then raise exception '只有現任 Manager 可以簽署此保密協議'; end if;
  else
    if identity_type is null or identity_type not in ('tw', 'cn_hk_mo', 'foreign') then
      raise exception '請選擇簽署身分';
    end if;
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

notify pgrst, 'reload schema';
commit;
