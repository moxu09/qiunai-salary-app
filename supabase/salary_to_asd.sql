-- Atomically move available salary into the employee's own ASD wallet.
-- Both ERP sites share this Supabase project, so apply this migration once.

alter table public.salary_withdraw_requests
  add column if not exists destination text not null default 'bank';

update public.salary_withdraw_requests
set destination = 'bank'
where destination is null or destination not in ('bank', 'asd');

alter table public.salary_withdraw_requests
  drop constraint if exists salary_withdraw_destination_valid;
alter table public.salary_withdraw_requests
  add constraint salary_withdraw_destination_valid
  check (destination in ('bank', 'asd')) not valid;
alter table public.salary_withdraw_requests
  validate constraint salary_withdraw_destination_valid;

create or replace function public.transfer_salary_to_asd_atomic(
  p_app_key text,
  p_discord_id text,
  p_staff_name text,
  p_amount integer,
  p_wallet_start_date date,
  p_wallet_start_iso timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_deposited numeric := 0;
  v_used numeric := 0;
  v_available numeric := 0;
  v_balance integer := 0;
  v_request_id uuid;
begin
  if p_app_key not in ('deepnight', 'qiunai') then
    raise exception 'ERP 來源不正確';
  end if;
  if nullif(trim(p_discord_id), '') is null then
    raise exception '找不到員工 Discord 帳號';
  end if;
  if p_amount < 1001 then
    raise exception '轉入 ASD 金額必須高於 1,000 元';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('salary-asd:' || p_app_key || ':' || p_discord_id, 0)
  );

  select coalesce(sum(amount), 0)
  into v_deposited
  from public.salary_wallet_entries
  where app_key = p_app_key
    and discord_id = p_discord_id
    and settlement_date >= p_wallet_start_date;

  select coalesce(sum(amount), 0)
  into v_used
  from public.salary_withdraw_requests
  where app_key = p_app_key
    and discord_id = p_discord_id
    and status in ('approved', 'pending')
    and requested_at >= p_wallet_start_iso;

  v_available := v_deposited - v_used;

  if p_amount > floor(v_available) then
    raise exception '轉入金額超過可提領薪資，目前可用 % 元', floor(v_available);
  end if;

  insert into public.users (user_id, coins)
  values (p_discord_id, 0)
  on conflict (user_id) do nothing;

  select coalesce(coins, 0)
  into v_balance
  from public.users
  where user_id = p_discord_id
  for update;

  v_balance := v_balance + p_amount;

  update public.users
  set coins = v_balance
  where user_id = p_discord_id;

  insert into public.salary_withdraw_requests (
    app_key,
    discord_id,
    staff_name,
    amount,
    service_fee,
    welfare_fee,
    payout_amount,
    status,
    destination,
    request_note,
    reviewed_by,
    reviewed_at,
    requested_at,
    updated_at
  ) values (
    p_app_key,
    p_discord_id,
    nullif(trim(p_staff_name), ''),
    p_amount,
    0,
    0,
    p_amount,
    'approved',
    'asd',
    '薪資轉入本人 ASD',
    p_discord_id,
    now(),
    now(),
    now()
  )
  returning id into v_request_id;

  insert into public.wallet_logs (user_id, type, amount, balance, note)
  values (
    p_discord_id,
    '薪資轉入',
    p_amount,
    v_balance,
    case p_app_key
      when 'qiunai' then '秋奈 ERP 薪資轉入 ASD'
      else '深夜不關燈 ERP 薪資轉入 ASD'
    end
  );

  return jsonb_build_object(
    'request_id', v_request_id,
    'amount', p_amount,
    'balance', v_balance
  );
end;
$function$;

revoke all on function public.transfer_salary_to_asd_atomic(
  text, text, text, integer, date, timestamptz
) from public;
grant execute on function public.transfer_salary_to_asd_atomic(
  text, text, text, integer, date, timestamptz
) to service_role;

notify pgrst, 'reload schema';
