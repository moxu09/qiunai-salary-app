-- Atomic money-flow protections shared by both bots and salary sites.
-- Re-runnable after restoring a backup.

alter table public.users
  drop constraint if exists users_coins_nonnegative;
alter table public.users
  add constraint users_coins_nonnegative check (coalesce(coins, 0) >= 0) not valid;
alter table public.users validate constraint users_coins_nonnegative;

alter table public.member_monthly_accounts
  drop constraint if exists member_monthly_amounts_valid;
alter table public.member_monthly_accounts
  add constraint member_monthly_amounts_valid
  check (monthly_limit >= 0 and used_amount >= 0 and used_amount <= monthly_limit) not valid;
alter table public.member_monthly_accounts
  validate constraint member_monthly_amounts_valid;

alter table public.salary_withdraw_requests
  drop constraint if exists salary_withdraw_amount_positive;
alter table public.salary_withdraw_requests
  add constraint salary_withdraw_amount_positive check (amount > 0) not valid;
alter table public.salary_withdraw_requests
  validate constraint salary_withdraw_amount_positive;

create unique index if not exists salary_withdraw_one_pending_per_staff
  on public.salary_withdraw_requests (app_key, discord_id)
  where status = 'pending';

create or replace function public.pay_play_order_with_wallet(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.play_orders%rowtype;
  v_balance integer;
  v_amount integer;
begin
  select * into v_order
  from public.play_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '找不到訂單';
  end if;
  if coalesce(v_order.paid, false) then
    raise exception '訂單已付款';
  end if;

  v_amount := coalesce(v_order.final_price, v_order.price, 0);
  if v_amount <= 0 then
    raise exception '訂單金額錯誤';
  end if;

  insert into public.users (user_id, coins)
  values (v_order.customer_id, 0)
  on conflict (user_id) do nothing;

  select coalesce(coins, 0) into v_balance
  from public.users
  where user_id = v_order.customer_id
  for update;

  if v_balance < v_amount then
    raise exception '餘額不足，目前餘額 % ASD，需要 % ASD', v_balance, v_amount;
  end if;

  v_balance := v_balance - v_amount;

  update public.users
  set coins = v_balance
  where user_id = v_order.customer_id;

  update public.play_orders
  set paid = true,
      paid_at = now(),
      updated_at = now()
  where id = p_order_id;

  insert into public.wallet_logs (user_id, type, amount, balance, note)
  values (
    v_order.customer_id,
    '訂單扣款',
    -v_amount,
    v_balance,
    '訂單 ' || coalesce(v_order.order_no, v_order.id::text) || '｜' ||
      coalesce(v_order.service, '陪玩訂單')
  );

  return jsonb_build_object(
    'order_id', v_order.id,
    'customer_id', v_order.customer_id,
    'amount', v_amount,
    'balance', v_balance
  );
end;
$function$;

create or replace function public.pay_play_order_with_monthly(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.play_orders%rowtype;
  v_account public.member_monthly_accounts%rowtype;
  v_amount integer;
  v_cashback integer;
  v_new_used integer;
  v_billing_month text;
begin
  select * into v_order
  from public.play_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception '找不到訂單';
  end if;
  if coalesce(v_order.paid, false) then
    raise exception '訂單已付款';
  end if;

  v_amount := coalesce(v_order.final_price, v_order.price, 0);
  if v_amount <= 0 then
    raise exception '訂單金額錯誤';
  end if;

  select * into v_account
  from public.member_monthly_accounts
  where user_id = v_order.customer_id
  for update;

  if not found then
    raise exception '尚未開通月結會員';
  end if;
  if not v_account.enabled then
    raise exception '月結會員目前已停用';
  end if;
  if v_account.monthly_limit - v_account.used_amount < v_amount then
    raise exception '月結額度不足，目前可用 NT$%', v_account.monthly_limit - v_account.used_amount;
  end if;

  v_new_used := v_account.used_amount + v_amount;
  v_cashback := floor(v_amount * 0.03);
  v_billing_month := to_char(timezone('Asia/Taipei', now()), 'YYYY-MM');

  update public.member_monthly_accounts
  set used_amount = v_new_used,
      updated_at = now()
  where user_id = v_order.customer_id;

  insert into public.member_monthly_transactions (
    user_id, source_type, source_id, item_name, benefit_type,
    amount, cashback, billing_month, status
  ) values (
    v_order.customer_id,
    'order',
    v_order.id::text,
    coalesce(v_order.service, v_order.order_item, '陪玩訂單'),
    coalesce(v_order.game, '陪玩服務'),
    v_amount,
    v_cashback,
    v_billing_month,
    'unbilled'
  );

  update public.play_orders
  set paid = true,
      paid_at = now(),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'customer_id', v_order.customer_id,
    'amount', v_amount,
    'cashback', v_cashback,
    'used_amount', v_new_used,
    'monthly_limit', v_account.monthly_limit,
    'available_amount', v_account.monthly_limit - v_new_used
  );
end;
$function$;

revoke all on function public.pay_play_order_with_wallet(uuid) from public;
revoke all on function public.pay_play_order_with_monthly(uuid) from public;
grant execute on function public.pay_play_order_with_wallet(uuid) to service_role;
grant execute on function public.pay_play_order_with_monthly(uuid) to service_role;

create table if not exists public.wallet_balance_audit (
  id bigint generated by default as identity primary key,
  user_id text not null,
  old_balance integer not null,
  new_balance integer not null,
  delta integer not null,
  transaction_id bigint not null,
  changed_at timestamptz not null default now()
);

create index if not exists wallet_balance_audit_user_changed
  on public.wallet_balance_audit (user_id, changed_at desc);

create or replace function public.audit_user_coin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(old.coins, 0) is distinct from coalesce(new.coins, 0) then
    insert into public.wallet_balance_audit (
      user_id, old_balance, new_balance, delta, transaction_id
    ) values (
      new.user_id,
      coalesce(old.coins, 0),
      coalesce(new.coins, 0),
      coalesce(new.coins, 0) - coalesce(old.coins, 0),
      txid_current()
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists users_coin_audit_trigger on public.users;
create trigger users_coin_audit_trigger
after update of coins on public.users
for each row execute function public.audit_user_coin_change();

create table if not exists public.monthly_balance_audit (
  id bigint generated by default as identity primary key,
  user_id text not null,
  old_used_amount integer not null,
  new_used_amount integer not null,
  delta integer not null,
  transaction_id bigint not null,
  changed_at timestamptz not null default now()
);

create index if not exists monthly_balance_audit_user_changed
  on public.monthly_balance_audit (user_id, changed_at desc);

create or replace function public.audit_monthly_balance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.used_amount is distinct from new.used_amount then
    insert into public.monthly_balance_audit (
      user_id, old_used_amount, new_used_amount, delta, transaction_id
    ) values (
      new.user_id,
      old.used_amount,
      new.used_amount,
      new.used_amount - old.used_amount,
      txid_current()
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists monthly_balance_audit_trigger
  on public.member_monthly_accounts;
create trigger monthly_balance_audit_trigger
after update of used_amount on public.member_monthly_accounts
for each row execute function public.audit_monthly_balance_change();

revoke all on public.wallet_balance_audit from anon, authenticated;
revoke all on public.monthly_balance_audit from anon, authenticated;

create or replace function public.transfer_coins(
  sender_id text,
  receiver_id text,
  transfer_amount integer
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  sender_balance integer;
  receiver_balance integer;
begin
  if sender_id is null or sender_id = '' or receiver_id is null or receiver_id = '' then
    raise exception '找不到使用者';
  end if;
  if sender_id = receiver_id then
    raise exception '不能轉給自己';
  end if;
  if transfer_amount is null or transfer_amount <= 0 then
    raise exception '金額錯誤';
  end if;
  if transfer_amount > 10000 then
    raise exception '單次轉帳不能超過 10000';
  end if;

  insert into public.users(user_id, coins)
  values(sender_id, 0), (receiver_id, 0)
  on conflict (user_id) do nothing;

  perform 1
  from public.users
  where user_id in (sender_id, receiver_id)
  order by user_id
  for update;

  select coalesce(coins, 0) into sender_balance
  from public.users where user_id = sender_id;
  select coalesce(coins, 0) into receiver_balance
  from public.users where user_id = receiver_id;

  if sender_balance < transfer_amount then
    raise exception '餘額不足';
  end if;

  sender_balance := sender_balance - transfer_amount;
  receiver_balance := receiver_balance + transfer_amount;

  update public.users set coins = sender_balance where user_id = sender_id;
  update public.users set coins = receiver_balance where user_id = receiver_id;

  insert into public.transfers(sender_id, receiver_id, amount)
  values(sender_id, receiver_id, transfer_amount);

  return json_build_object(
    'success', true,
    'sender_balance', sender_balance,
    'receiver_balance', receiver_balance
  );
end;
$function$;

revoke all on function public.change_user_coins(text, numeric)
  from public, anon, authenticated;
revoke all on function public.transfer_coins(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.pay_play_order_with_wallet(uuid)
  from public, anon, authenticated;
revoke all on function public.pay_play_order_with_monthly(uuid)
  from public, anon, authenticated;
revoke all on function public.perform_gacha(text, integer, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_red_packet_safe(bigint, text)
  from public, anon, authenticated;

grant execute on function public.change_user_coins(text, numeric) to service_role;
grant execute on function public.transfer_coins(text, text, integer) to service_role;
grant execute on function public.pay_play_order_with_wallet(uuid) to service_role;
grant execute on function public.pay_play_order_with_monthly(uuid) to service_role;
grant execute on function public.perform_gacha(text, integer, integer, jsonb)
  to service_role;
grant execute on function public.claim_red_packet_safe(bigint, text)
  to service_role;

