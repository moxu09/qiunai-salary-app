-- 公開一番賞結帳前的 Discord 私訊身分驗證。驗證碼與領獎 token 只儲存雜湊。
create table if not exists public.qiunai_ichiban_identity_challenges (
  id uuid primary key,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{15,25}$'),
  code_digest text not null,
  token_digest text,
  ip_digest text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists qiunai_ichiban_identity_user_time_idx
  on public.qiunai_ichiban_identity_challenges(discord_user_id, created_at desc);
create index if not exists qiunai_ichiban_identity_ip_time_idx
  on public.qiunai_ichiban_identity_challenges(ip_digest, created_at desc);
alter table public.qiunai_ichiban_identity_challenges enable row level security;
revoke all on public.qiunai_ichiban_identity_challenges from anon, authenticated;

create or replace function public.qiunai_ichiban_verify_identity(
  p_challenge_id uuid, p_code_digest text, p_token_digest text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_row public.qiunai_ichiban_identity_challenges%rowtype;
begin
  select * into v_row from public.qiunai_ichiban_identity_challenges
  where id = p_challenge_id for update;
  if not found or v_row.expires_at <= now() or v_row.verified_at is not null
     or v_row.attempts >= 5 then return false; end if;
  if v_row.code_digest <> p_code_digest then
    update public.qiunai_ichiban_identity_challenges
    set attempts = attempts + 1 where id = p_challenge_id;
    return false;
  end if;
  update public.qiunai_ichiban_identity_challenges
  set verified_at = now(), token_digest = p_token_digest
  where id = p_challenge_id;
  return true;
end;
$$;
revoke all on function public.qiunai_ichiban_verify_identity(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.qiunai_ichiban_verify_identity(uuid,text,text) to service_role;
