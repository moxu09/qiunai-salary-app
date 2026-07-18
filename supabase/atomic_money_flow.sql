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

create or replace function public.settle_monthly_bill_atomic(
  p_bill_id bigint,
  p_paid_by text,
  p_method text,
  p_deduct_wallet boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_bill public.member_monthly_bills%rowtype;
  v_account public.member_monthly_accounts%rowtype;
  v_balance integer;
  v_after_debit integer;
  v_final_balance integer;
  v_new_used integer;
begin
  select * into v_bill
  from public.member_monthly_bills
  where id = p_bill_id
  for update;

  if not found then raise exception '找不到月結帳單'; end if;
  if v_bill.status = 'paid' then raise exception '這張帳單已經繳清'; end if;
  if v_bill.status = 'deducted' then raise exception '這張帳單已由保證金抵扣'; end if;
  if v_bill.total_amount <= 0 then raise exception '帳單金額錯誤'; end if;

  select * into v_account
  from public.member_monthly_accounts
  where user_id = v_bill.user_id
  for update;

  if not found then raise exception '找不到月結帳戶'; end if;

  insert into public.users(user_id, coins)
  values(v_bill.user_id, 0)
  on conflict (user_id) do nothing;

  select coalesce(coins, 0) into v_balance
  from public.users
  where user_id = v_bill.user_id
  for update;

  if p_deduct_wallet then
    if v_balance < v_bill.total_amount then
      raise exception 'ASD 餘額不足，目前餘額 % ASD，需要 % ASD',
        v_balance, v_bill.total_amount;
    end if;
    v_after_debit := v_balance - v_bill.total_amount;
    update public.users set coins = v_after_debit where user_id = v_bill.user_id;
    insert into public.wallet_logs(user_id, type, amount, balance, note)
    values(
      v_bill.user_id, '月結繳費', -v_bill.total_amount, v_after_debit,
      '🌙 ' || v_bill.billing_month || ' 月結帳單繳費'
    );
  else
    v_after_debit := v_balance;
  end if;

  v_new_used := greatest(0, v_account.used_amount - v_bill.total_amount);

  update public.member_monthly_bills
  set status = 'paid', paid_at = now()
  where id = v_bill.id;

  update public.member_monthly_accounts
  set used_amount = v_new_used, updated_at = now()
  where user_id = v_bill.user_id;

  update public.member_monthly_transactions
  set status = 'paid'
  where user_id = v_bill.user_id
    and billing_month = v_bill.billing_month
    and status in ('billed', 'unbilled');

  v_final_balance := v_after_debit + v_bill.cashback_amount;
  if v_bill.cashback_amount > 0 then
    update public.users set coins = v_final_balance where user_id = v_bill.user_id;
    insert into public.wallet_logs(user_id, type, amount, balance, note)
    values(
      v_bill.user_id, '月結回饋', v_bill.cashback_amount, v_final_balance,
      '🌙 ' || v_bill.billing_month || ' 月結帳單已繳清，發放 3% 回饋'
    );
  end if;

  return jsonb_build_object(
    'bill_id', v_bill.id,
    'user_id', v_bill.user_id,
    'billing_month', v_bill.billing_month,
    'total_amount', v_bill.total_amount,
    'cashback_amount', v_bill.cashback_amount,
    'old_used_amount', v_account.used_amount,
    'new_used_amount', v_new_used,
    'final_balance', v_final_balance,
    'method', p_method,
    'paid_by', p_paid_by
  );
end;
$function$;

revoke all on function public.settle_monthly_bill_atomic(bigint, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_monthly_bill_atomic(bigint, text, text, boolean)
  to service_role;

create or replace function public.purchase_shop_item_atomic(
  p_user_id text,
  p_item_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item public.shop_items%rowtype;
  v_balance integer;
  v_item_type text;
begin
  if p_user_id is null or p_user_id = '' then raise exception '找不到使用者'; end if;

  select * into v_item
  from public.shop_items
  where id = p_item_id
  for share;

  if not found then raise exception '商品不存在'; end if;
  if v_item.price < 0 then raise exception '商品價格錯誤'; end if;

  insert into public.users(user_id, coins)
  values(p_user_id, 0)
  on conflict (user_id) do nothing;

  select coalesce(coins, 0) into v_balance
  from public.users
  where user_id = p_user_id
  for update;

  if v_balance < v_item.price then raise exception '星雨幣不足'; end if;

  v_balance := v_balance - v_item.price;
  v_item_type := case when v_item.item_type = 'coupon' then 'coupon' else 'shop' end;

  update public.users
  set coins = v_balance,
      total_spent = coalesce(total_spent, 0) + v_item.price,
      month_spent = coalesce(month_spent, 0) + v_item.price
  where user_id = p_user_id;

  insert into public.user_items(user_id,item_name,rarity,description,item_type)
  values(p_user_id,v_item.item_name,null,v_item.description,v_item_type);

  insert into public.wallet_logs(user_id,type,amount,balance,note)
  values(p_user_id,'商店購買',-v_item.price,v_balance,'🛒 購買商品：' || v_item.item_name);

  return jsonb_build_object(
    'item_id', v_item.id,
    'item_name', v_item.item_name,
    'item_type', v_item_type,
    'description', v_item.description,
    'price', v_item.price,
    'balance', v_balance
  );
end;
$function$;

revoke all on function public.purchase_shop_item_atomic(text, bigint)
  from public, anon, authenticated;
grant execute on function public.purchase_shop_item_atomic(text, bigint)
  to service_role;

create or replace function public.perform_gacha_atomic(
  p_user_id text,
  p_cost integer,
  p_reward_coins integer,
  p_rewards jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_balance integer;
  v_final_balance integer;
begin
  if p_user_id is null or p_user_id = '' then raise exception '找不到使用者'; end if;
  if p_cost is null or p_cost <= 0 then raise exception '扭蛋金額錯誤'; end if;
  if p_reward_coins is null or p_reward_coins < 0 then raise exception '獎勵金額錯誤'; end if;

  insert into public.users(user_id, coins)
  values(p_user_id, 0)
  on conflict (user_id) do nothing;

  select coalesce(coins, 0) into v_balance
  from public.users
  where user_id = p_user_id
  for update;

  if v_balance < p_cost then raise exception '星雨幣不足'; end if;

  v_final_balance := v_balance - p_cost + p_reward_coins;
  update public.users set coins = v_final_balance where user_id = p_user_id;

  insert into public.user_items(user_id,item_name,rarity,description,item_type)
  select
    p_user_id,
    reward.item_name,
    reward.rarity,
    reward.description,
    reward.item_type
  from jsonb_to_recordset(coalesce(p_rewards, '[]'::jsonb))
    as reward(
      user_id text,
      item_name text,
      rarity text,
      description text,
      item_type text
    );

  insert into public.wallet_logs(user_id,type,amount,balance,note)
  values(
    p_user_id,
    '扭蛋',
    p_reward_coins - p_cost,
    v_final_balance,
    '🎰 扭蛋消費 ' || p_cost || ' ASD，金幣獎勵 ' || p_reward_coins || ' ASD'
  );

  return v_final_balance;
end;
$function$;

revoke all on function public.perform_gacha_atomic(text, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.perform_gacha_atomic(text, integer, integer, jsonb)
  to service_role;

create or replace function public.claim_prepared_red_packet_atomic(
  p_packet_id bigint,
  p_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_packet public.red_packets%rowtype;
  v_share public.red_packet_claims%rowtype;
  v_balance integer;
  v_left_amount integer;
  v_left_count integer;
  v_prefix text;
begin
  if p_user_id is null or p_user_id = '' then raise exception '找不到使用者'; end if;

  select * into v_packet
  from public.red_packets
  where id = p_packet_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'message','找不到這包紅包','claim_amount',0,'new_balance',0,'left_amount',0,'left_count',0);
  end if;

  if exists(
    select 1 from public.red_packet_claims
    where packet_id = p_packet_id and user_id = p_user_id
  ) then
    return jsonb_build_object(
      'success',false,'message','你已經搶過這包紅包了','claim_amount',0,
      'new_balance',0,'left_amount',v_packet.remaining_amount,'left_count',v_packet.remaining_count
    );
  end if;

  if v_packet.status <> 'active' or v_packet.remaining_amount <= 0 or v_packet.remaining_count <= 0 then
    return jsonb_build_object('success',false,'message','紅包已被搶完','claim_amount',0,'new_balance',0,'left_amount',0,'left_count',0);
  end if;

  v_prefix := '__pending_red_packet_' || p_packet_id || '_';
  select * into v_share
  from public.red_packet_claims
  where packet_id = p_packet_id and user_id like v_prefix || '%'
  order by id
  for update skip locked
  limit 1;

  if not found then return null; end if;

  update public.red_packet_claims
  set user_id = p_user_id
  where id = v_share.id;

  insert into public.users(user_id,coins)
  values(p_user_id,0)
  on conflict(user_id) do nothing;

  select coalesce(coins,0) into v_balance
  from public.users
  where user_id = p_user_id
  for update;

  v_balance := v_balance + v_share.amount;
  update public.users set coins = v_balance where user_id = p_user_id;

  insert into public.wallet_logs(user_id,type,amount,balance,note)
  values(
    p_user_id,'搶紅包',v_share.amount,v_balance,
    '🧧 搶到紅包 ' || coalesce(v_packet.packet_no,p_packet_id::text)
  );

  v_left_amount := greatest(0,v_packet.remaining_amount-v_share.amount);
  v_left_count := greatest(0,v_packet.remaining_count-1);

  update public.red_packets
  set remaining_amount=v_left_amount,
      remaining_count=v_left_count,
      status=case when v_left_amount<=0 or v_left_count<=0 then 'finished' else 'active' end
  where id=p_packet_id;

  return jsonb_build_object(
    'success',true,'message','success','claim_amount',v_share.amount,
    'new_balance',v_balance,'left_amount',v_left_amount,'left_count',v_left_count
  );
end;
$function$;

revoke all on function public.claim_prepared_red_packet_atomic(bigint,text)
  from public, anon, authenticated;
grant execute on function public.claim_prepared_red_packet_atomic(bigint,text)
  to service_role;

create table if not exists public.tip_payment_operations (
  operation_key text primary key,
  guild_id text not null,
  user_id text not null,
  total_amount integer not null check (total_amount > 0),
  result jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.pay_tip_with_wallet_atomic(
  p_operation_key text, p_guild_id text, p_user_id text, p_item text,
  p_amount integer, p_channel_id text, p_salary_table text, p_staff jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  v_existing jsonb; v_balance integer; v_total integer; v_staff_count integer;
  v_staff jsonb; v_order public.play_orders%rowtype;
  v_orders jsonb := '[]'::jsonb; v_finished_at timestamptz := now();
begin
  if coalesce(p_operation_key, '') = '' then raise exception '交易識別碼不可為空'; end if;
  if coalesce(p_guild_id, '') = '' then raise exception '伺服器識別碼不可為空'; end if;
  if coalesce(p_user_id, '') = '' then raise exception '找不到打賞人'; end if;
  if coalesce(p_item, '') = '' then raise exception '找不到打賞品項'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '打賞金額錯誤'; end if;
  if p_salary_table not in ('play_orders', 'qiunai_salary_orders') then raise exception '不允許的薪資資料表'; end if;
  if jsonb_typeof(p_staff) <> 'array' then raise exception '陪陪資料格式錯誤'; end if;
  select result into v_existing from public.tip_payment_operations where operation_key = p_operation_key;
  if found then return v_existing; end if;
  select count(distinct value->>'staff_id') into v_staff_count from jsonb_array_elements(p_staff);
  if v_staff_count <= 0 or v_staff_count <> jsonb_array_length(p_staff) then raise exception '陪陪資料不可為空或重複'; end if;
  v_total := p_amount * v_staff_count;
  insert into public.users(user_id, coins) values(p_user_id, 0) on conflict(user_id) do nothing;
  select coalesce(coins, 0) into v_balance from public.users where user_id = p_user_id for update;
  if v_balance < v_total then raise exception '餘額不足，目前餘額 % ASD，需要 % ASD', v_balance, v_total; end if;
  for v_staff in select value from jsonb_array_elements(p_staff) loop
    if coalesce(v_staff->>'staff_id', '') = '' then raise exception '陪陪資料不完整'; end if;
    insert into public.play_orders(guild_id,customer_id,customer_name,customer_username,assigned_player,order_type,order_item,game,service,note,channel_id,source_channel_id,price,final_price,paid,paid_at,salary_paid,status,completed_at,accepted_at)
    values(p_guild_id,p_user_id,'<@'||p_user_id||'>','<@'||p_user_id||'>',v_staff->>'staff_id','打賞',p_item,'打賞','打賞：'||p_item,'打賞',p_channel_id,p_channel_id,p_amount,p_amount,true,v_finished_at,false,'completed',v_finished_at,v_finished_at)
    returning * into v_order;
    if p_salary_table = 'play_orders' then
      update public.play_orders set discord_id=v_staff->>'staff_id',staff_name=nullif(v_staff->>'staff_name',''),order_amount=p_amount,staff_salary=round(p_amount*((v_staff->>'salary_rate')::numeric/100)),bonus_amount=0,salary_rate=(v_staff->>'salary_rate')::integer,salary_level=v_staff->>'salary_level',platform_income=p_amount,platform_expense=round(p_amount*((v_staff->>'salary_rate')::numeric/100)),order_finished_at=v_finished_at,is_deleted=false where id=v_order.id;
    else
      execute format('insert into public.%I (order_id,discord_id,staff_name,customer_name,service_name,order_amount,staff_salary,bonus_amount,salary_rate,salary_level,platform_income,platform_expense,status,order_finished_at,is_deleted) values ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$6,$7,''未發薪'',$10,false)',p_salary_table)
      using coalesce(v_order.order_no,v_order.id::text),v_staff->>'staff_id',nullif(v_staff->>'staff_name',''),'<@'||p_user_id||'>','打賞：'||p_item,p_amount,round(p_amount*((v_staff->>'salary_rate')::numeric/100)),(v_staff->>'salary_rate')::integer,v_staff->>'salary_level',v_finished_at;
    end if;
    v_orders := v_orders || jsonb_build_array(jsonb_build_object('id',v_order.id,'order_no',v_order.order_no,'customer_id',v_order.customer_id,'assigned_player',v_order.assigned_player,'final_price',v_order.final_price,'service',v_order.service));
  end loop;
  v_balance := v_balance-v_total;
  update public.users set coins=v_balance where user_id=p_user_id;
  insert into public.wallet_logs(user_id,type,amount,balance,note) values(p_user_id,'打賞消費',-v_total,v_balance,'💝 打賞給 '||array_to_string(array(select '<@'||(value->>'staff_id')||'>' from jsonb_array_elements(p_staff)),'、')||'｜'||p_item);
  v_existing := jsonb_build_object('operation_key',p_operation_key,'balance',v_balance,'total_amount',v_total,'orders',v_orders);
  insert into public.tip_payment_operations(operation_key,guild_id,user_id,total_amount,result) values(p_operation_key,p_guild_id,p_user_id,v_total,v_existing);
  return v_existing;
end;
$function$;
revoke all on function public.pay_tip_with_wallet_atomic(text,text,text,text,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.pay_tip_with_wallet_atomic(text,text,text,text,integer,text,text,jsonb) to service_role;
