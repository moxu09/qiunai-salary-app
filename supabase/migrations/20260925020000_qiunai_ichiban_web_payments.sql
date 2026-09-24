-- 網頁版一番賞：付款意向先佔名額；只在綠界驗證成功的通知內抽紙。
create table if not exists public.qiunai_ichiban_web_orders (
  id uuid primary key default gen_random_uuid(),
  merchant_trade_no text not null unique check (merchant_trade_no ~ '^[A-Za-z0-9]{1,20}$'),
  challenge_id uuid not null references public.qiunai_ichiban_identity_challenges(id),
  discord_user_id text not null,
  email text not null,
  merchant_id text not null,
  amount integer not null default 300 check (amount = 300),
  status text not null default 'pending' check (status in ('pending','processing','drawn','failed','refund_required')),
  gateway_trade_no text,
  draw_id uuid unique references public.qiunai_ichiban_draws(id),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qiunai_ichiban_web_orders_user_idx
  on public.qiunai_ichiban_web_orders(discord_user_id, created_at desc);
alter table public.qiunai_ichiban_web_orders enable row level security;
revoke all on public.qiunai_ichiban_web_orders from anon, authenticated;

create or replace function public.qiunai_ichiban_begin_web_payment(
  p_challenge_id uuid, p_token_digest text, p_email text,
  p_merchant_trade_no text, p_merchant_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_identity public.qiunai_ichiban_identity_challenges%rowtype;
  v_remaining integer; v_pending integer; v_id uuid;
begin
  if p_email !~* '^[^ @]+@[^ @]+\.[^ @]+$' or length(p_email) > 100
     or p_merchant_trade_no !~ '^[A-Za-z0-9]{1,20}$'
     or p_merchant_id !~ '^[0-9]{7,10}$' then
    raise exception '一番賞付款資料格式錯誤';
  end if;
  perform 1 from public.qiunai_ichiban_pool_mutex where id = 1 for update;
  select * into v_identity from public.qiunai_ichiban_identity_challenges
    where id = p_challenge_id and token_digest = p_token_digest
      and verified_at is not null and expires_at > now();
  if not found then raise exception 'Discord 驗證已過期，請重新驗證'; end if;
  select count(*) into v_remaining from public.qiunai_ichiban_tickets where draw_id is null;
  select count(*) into v_pending from public.qiunai_ichiban_web_orders
    where (status = 'pending' and created_at > now() - interval '45 minutes')
       or (status = 'processing' and updated_at > now() - interval '24 hours');
  if v_remaining <= v_pending then raise exception '目前沒有可付款的剩餘抽紙'; end if;
  if (select count(*) from public.qiunai_ichiban_web_orders
      where challenge_id = p_challenge_id and
       ((status = 'pending' and created_at > now() - interval '45 minutes')
        or (status = 'processing' and updated_at > now() - interval '24 hours'))) >= 2 then
    raise exception '請先完成或等候既有付款單';
  end if;
  insert into public.qiunai_ichiban_web_orders
    (merchant_trade_no,challenge_id,discord_user_id,email,merchant_id)
  values (p_merchant_trade_no,p_challenge_id,v_identity.discord_user_id,p_email,p_merchant_id)
  returning id into v_id;
  return jsonb_build_object('order_id',v_id,'merchant_trade_no',p_merchant_trade_no);
end;
$$;

create or replace function public.qiunai_ichiban_set_web_order_status(
  p_merchant_trade_no text, p_status text, p_reason text default null
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('processing','failed') then raise exception '不允許的狀態'; end if;
  update public.qiunai_ichiban_web_orders
  set status = p_status, failure_reason = left(p_reason,500), updated_at=now()
  where merchant_trade_no = p_merchant_trade_no and status in ('pending','processing');
  return found;
end;
$$;

create or replace function public.qiunai_ichiban_fulfill_web_payment(
  p_merchant_trade_no text, p_merchant_id text, p_gateway_trade_no text,
  p_amount integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.qiunai_ichiban_web_orders%rowtype;
  v_ticket public.qiunai_ichiban_tickets%rowtype; v_draw uuid;
  v_last boolean; v_credit integer; v_balance integer;
begin
  perform 1 from public.qiunai_ichiban_pool_mutex where id = 1 for update;
  select * into v_order from public.qiunai_ichiban_web_orders
    where merchant_trade_no = p_merchant_trade_no for update;
  if not found or v_order.merchant_id <> p_merchant_id or v_order.amount <> p_amount
     or p_gateway_trade_no !~ '^[0-9A-Za-z]{1,20}$' then
    raise exception '綠界交易與付款單不符';
  end if;
  if v_order.status = 'drawn' then
    if v_order.gateway_trade_no <> p_gateway_trade_no then raise exception '交易編號不一致'; end if;
    return jsonb_build_object('already_processed',true,'draw_id',v_order.draw_id);
  end if;
  if v_order.status = 'refund_required' then
    return jsonb_build_object('refund_required',true);
  end if;
  if v_order.status = 'failed' then raise exception '已取消付款單收到成功通知，需人工核對退款'; end if;
  select * into v_ticket from public.qiunai_ichiban_tickets
    where draw_id is null order by random() limit 1;
  if not found then
    update public.qiunai_ichiban_web_orders set status='refund_required',
      gateway_trade_no=p_gateway_trade_no, failure_reason='付款成功但獎池已售完',updated_at=now()
      where id=v_order.id;
    return jsonb_build_object('refund_required',true);
  end if;
  select count(*)=1 into v_last from public.qiunai_ichiban_tickets where draw_id is null;
  insert into public.qiunai_ichiban_draws
    (discord_user_id,payment_provider,payment_reference,paid_amount,prize_id,ticket_no,is_last_one)
  values (v_order.discord_user_id,'ecpay',p_merchant_trade_no,300,v_ticket.prize_id,v_ticket.ticket_no,v_last)
  returning id into v_draw;
  update public.qiunai_ichiban_tickets set draw_id=v_draw,drawn_at=now()
    where ticket_no=v_ticket.ticket_no;
  if v_ticket.prize_id ~ '^[a-f]-asd-[0-9]+$' then
    v_credit:=substring(v_ticket.prize_id from 'asd-([0-9]+)$')::integer;
    insert into public.users(user_id,coins) values(v_order.discord_user_id,0)
      on conflict(user_id) do nothing;
    update public.users set coins=coalesce(coins,0)+v_credit
      where user_id=v_order.discord_user_id returning coins into v_balance;
    insert into public.wallet_logs(user_id,type,amount,balance,note)
    values(v_order.discord_user_id,'抽獎獎品',v_credit,v_balance,'秋奈一番賞網頁獎品｜'||v_draw);
  end if;
  update public.qiunai_ichiban_web_orders set status='drawn',draw_id=v_draw,
    gateway_trade_no=p_gateway_trade_no,updated_at=now() where id=v_order.id;
  return jsonb_build_object('already_processed',false,'draw_id',v_draw,
    'prize_id',v_ticket.prize_id,'ticket_no',v_ticket.ticket_no,'is_last_one',v_last);
end;
$$;
revoke all on function public.qiunai_ichiban_begin_web_payment(uuid,text,text,text,text),
  public.qiunai_ichiban_set_web_order_status(text,text,text),
  public.qiunai_ichiban_fulfill_web_payment(text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.qiunai_ichiban_begin_web_payment(uuid,text,text,text,text),
  public.qiunai_ichiban_set_web_order_status(text,text,text),
  public.qiunai_ichiban_fulfill_web_payment(text,text,text,integer) to service_role;

-- 機器人 ASD 抽獎也必須尊重網頁版正在付款的保留名額。
create or replace function public.qiunai_ichiban_draw_asd(
  p_discord_user_id text, p_request_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare existing public.qiunai_ichiban_draws%rowtype;
  ticket public.qiunai_ichiban_tickets%rowtype;
  v_draw_id uuid; balance_after integer; prize_credit integer := 0;
  last_one boolean; v_remaining integer; v_pending integer;
begin
  if p_discord_user_id !~ '^[0-9]{15,25}$' or
     p_request_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception '一番賞請求資料格式錯誤';
  end if;
  perform 1 from public.qiunai_ichiban_pool_mutex where id = 1 for update;
  select * into existing from public.qiunai_ichiban_draws
    where payment_provider = 'asd' and payment_reference = p_request_id;
  if found then
    if existing.discord_user_id <> p_discord_user_id then raise exception '一番賞請求編號已被其他使用者使用'; end if;
    return jsonb_build_object('already_processed',true,'draw_id',existing.id,
      'prize_id',existing.prize_id,'ticket_no',existing.ticket_no,'is_last_one',existing.is_last_one);
  end if;
  select count(*) into v_remaining from public.qiunai_ichiban_tickets where draw_id is null;
  select count(*) into v_pending from public.qiunai_ichiban_web_orders
    where (status='pending' and created_at > now() - interval '45 minutes')
       or (status='processing' and updated_at > now() - interval '24 hours');
  if v_remaining <= v_pending then raise exception '一番賞抽紙已售完或正在付款中'; end if;
  select * into ticket from public.qiunai_ichiban_tickets
    where draw_id is null order by random() limit 1;
  if not found then raise exception '一番賞已全數抽完'; end if;
  select count(*)=1 into last_one from public.qiunai_ichiban_tickets where draw_id is null;
  insert into public.users(user_id, coins) values (p_discord_user_id,0)
    on conflict(user_id) do nothing;
  update public.users set coins=coalesce(coins,0)-300
    where user_id=p_discord_user_id and coalesce(coins,0)>=300
    returning coins into balance_after;
  if not found then raise exception 'ASD 餘額不足'; end if;
  insert into public.wallet_logs(user_id,type,amount,balance,note)
    values(p_discord_user_id,'扣款',-300,balance_after,'秋奈一番賞｜'||p_request_id);
  insert into public.qiunai_ichiban_draws
    (discord_user_id,payment_provider,payment_reference,paid_amount,prize_id,ticket_no,is_last_one)
    values(p_discord_user_id,'asd',p_request_id,300,ticket.prize_id,ticket.ticket_no,last_one)
    returning id into v_draw_id;
  update public.qiunai_ichiban_tickets set draw_id=v_draw_id,drawn_at=now()
    where ticket_no=ticket.ticket_no;
  if ticket.prize_id ~ '^[a-f]-asd-[0-9]+$' then
    prize_credit:=substring(ticket.prize_id from 'asd-([0-9]+)$')::integer;
    update public.users set coins=coins+prize_credit
      where user_id=p_discord_user_id returning coins into balance_after;
    insert into public.wallet_logs(user_id,type,amount,balance,note)
      values(p_discord_user_id,'抽獎獎品',prize_credit,balance_after,'秋奈一番賞 ASD 獎品｜'||v_draw_id);
  end if;
  return jsonb_build_object('already_processed',false,'draw_id',v_draw_id,
    'prize_id',ticket.prize_id,'ticket_no',ticket.ticket_no,
    'is_last_one',last_one,'balance',balance_after);
end; $$;
revoke all on function public.qiunai_ichiban_draw_asd(text,text) from public, anon, authenticated;
grant execute on function public.qiunai_ichiban_draw_asd(text,text) to service_role;
