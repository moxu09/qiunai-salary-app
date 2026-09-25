-- 街口付款與綠界使用同一張網頁付款單，共享獎池保留額度。
alter table public.qiunai_ichiban_web_orders
  add column if not exists payment_provider text not null default 'ecpay';
alter table public.qiunai_ichiban_web_orders
  add column if not exists payment_url text;
alter table public.qiunai_ichiban_web_orders
  drop constraint if exists qiunai_ichiban_web_orders_payment_provider_check;
alter table public.qiunai_ichiban_web_orders
  add constraint qiunai_ichiban_web_orders_payment_provider_check
  check (payment_provider in ('ecpay','jkopay'));

create or replace function public.qiunai_ichiban_begin_jkopay_payment(
  p_challenge_id uuid, p_token_digest text,
  p_merchant_trade_no text, p_store_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_identity public.qiunai_ichiban_identity_challenges%rowtype;
  v_remaining integer; v_pending integer; v_id uuid;
begin
  if p_merchant_trade_no !~ '^QI[A-F0-9]{18}$'
     or length(p_store_id) < 3 or length(p_store_id) > 100 then
    raise exception '一番賞街口付款資料格式錯誤';
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
    (merchant_trade_no,challenge_id,discord_user_id,email,merchant_id,payment_provider)
  values (p_merchant_trade_no,p_challenge_id,v_identity.discord_user_id,'',p_store_id,'jkopay')
  returning id into v_id;
  return jsonb_build_object('order_id',v_id,'merchant_trade_no',p_merchant_trade_no);
end;
$$;

create or replace function public.qiunai_ichiban_fulfill_jkopay_payment(
  p_merchant_trade_no text, p_store_id text, p_gateway_trade_no text,
  p_amount integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.qiunai_ichiban_web_orders%rowtype;
  v_ticket public.qiunai_ichiban_tickets%rowtype; v_draw uuid;
  v_last boolean; v_credit integer; v_balance integer;
begin
  perform 1 from public.qiunai_ichiban_pool_mutex where id = 1 for update;
  select * into v_order from public.qiunai_ichiban_web_orders
    where merchant_trade_no = p_merchant_trade_no for update;
  if not found or v_order.payment_provider <> 'jkopay'
     or v_order.merchant_id <> p_store_id or v_order.amount <> p_amount
     or p_gateway_trade_no !~ '^[0-9A-Za-z]{1,25}$' then
    raise exception '街口交易與付款單不符';
  end if;
  if v_order.status = 'drawn' then
    if v_order.gateway_trade_no <> p_gateway_trade_no then raise exception '交易編號不一致'; end if;
    return jsonb_build_object('already_processed',true,'draw_id',v_order.draw_id);
  end if;
  if v_order.status = 'refund_required' then return jsonb_build_object('refund_required',true); end if;
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
  values (v_order.discord_user_id,'jkopay',p_merchant_trade_no,300,v_ticket.prize_id,v_ticket.ticket_no,v_last)
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
    values(v_order.discord_user_id,'抽獎獎品',v_credit,v_balance,'秋奈一番賞街口獎品｜'||v_draw);
  end if;
  update public.qiunai_ichiban_web_orders set status='drawn',draw_id=v_draw,
    gateway_trade_no=p_gateway_trade_no,updated_at=now() where id=v_order.id;
  return jsonb_build_object('already_processed',false,'draw_id',v_draw,
    'prize_id',v_ticket.prize_id,'ticket_no',v_ticket.ticket_no,'is_last_one',v_last);
end;
$$;

-- 綠界成功通知不得兌換街口付款單。
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
  if not found or v_order.payment_provider <> 'ecpay'
     or v_order.merchant_id <> p_merchant_id or v_order.amount <> p_amount
     or p_gateway_trade_no !~ '^[0-9A-Za-z]{1,20}$' then
    raise exception '綠界交易與付款單不符';
  end if;
  if v_order.status = 'drawn' then
    if v_order.gateway_trade_no <> p_gateway_trade_no then raise exception '交易編號不一致'; end if;
    return jsonb_build_object('already_processed',true,'draw_id',v_order.draw_id);
  end if;
  if v_order.status = 'refund_required' then return jsonb_build_object('refund_required',true); end if;
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

revoke all on function public.qiunai_ichiban_begin_jkopay_payment(uuid,text,text,text),
  public.qiunai_ichiban_fulfill_jkopay_payment(text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.qiunai_ichiban_begin_jkopay_payment(uuid,text,text,text),
  public.qiunai_ichiban_fulfill_jkopay_payment(text,text,text,integer) to service_role;
