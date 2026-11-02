begin;
create table if not exists public.hr_theme_catalog (
 key text primary key, name text not null, price integer not null check(price>0), sale_ends_at timestamptz
);
insert into public.hr_theme_catalog(key,name,price,sale_ends_at) values
 ('white','純白色',10,null),('black','純黑色',10,null),('blue','純藍色',10,null),('gray','純灰色',10,null),('pink','純粉色',10,null),
 ('halloween-2026','萬聖節限定・幽靈遊戲屋',50,'2026-11-30T23:59:59.999+08:00')
on conflict(key) do update set name=excluded.name,price=excluded.price,sale_ends_at=excluded.sale_ends_at;
create table if not exists public.hr_theme_orders (
 id uuid primary key, discord_id text not null, theme_key text not null references public.hr_theme_catalog(key),
 payment_method text not null check(payment_method in ('ecpay','salary','asd')), amount integer not null check(amount>0),
 status text not null default 'pending' check(status in ('pending','processing','paid','failed','cancelled')),
 department text check(department in ('qiunai','deepnight')), merchant_id text, merchant_trade_no text unique,
 gateway_trade_no text unique, gateway_token text, email text, reason text,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes', paid_at timestamptz
);
create unique index if not exists hr_theme_one_active_payment on public.hr_theme_orders(discord_id,theme_key) where status in ('pending','processing');
create table if not exists public.hr_theme_entitlements (
 discord_id text not null, theme_key text not null references public.hr_theme_catalog(key),
 order_id uuid not null unique references public.hr_theme_orders(id), granted_at timestamptz not null default now(),
 primary key(discord_id,theme_key)
);
create table if not exists public.hr_theme_preferences (
 discord_id text primary key, theme_key text not null, updated_at timestamptz not null default now()
);
alter table public.hr_theme_catalog enable row level security;
alter table public.hr_theme_orders enable row level security;
alter table public.hr_theme_entitlements enable row level security;
alter table public.hr_theme_preferences enable row level security;
revoke all on public.hr_theme_catalog,public.hr_theme_orders,public.hr_theme_entitlements,public.hr_theme_preferences from public,anon,authenticated;
grant select,insert,update on public.hr_theme_catalog,public.hr_theme_orders,public.hr_theme_entitlements,public.hr_theme_preferences to service_role;

create or replace function public.hr_buy_theme_atomic(p_discord_id text,p_theme text,p_method text,p_request_id uuid,p_department text default null,p_merchant_id text default null,p_trade_no text default null,p_email text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_product public.hr_theme_catalog%rowtype; v_order public.hr_theme_orders%rowtype; v_staff jsonb; v_available numeric; v_balance integer; v_bonus uuid:=gen_random_uuid(); v_table text; v_period text; v_label text;
begin
 if p_discord_id is null or p_discord_id!~'^\d{15,22}$' or p_request_id is null or p_method not in ('ecpay','salary','asd') then raise exception '購買資料無效'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-theme:'||p_discord_id||':'||p_theme,0));
 select * into v_order from public.hr_theme_orders where id=p_request_id;
 if found then
  if v_order.discord_id<>p_discord_id or v_order.theme_key<>p_theme or v_order.payment_method<>p_method or v_order.department is distinct from p_department then raise exception '購買識別碼已使用';end if;
  return to_jsonb(v_order)-'gateway_token'-'email';
 end if;
 if exists(select 1 from public.hr_theme_entitlements where discord_id=p_discord_id and theme_key=p_theme) then return jsonb_build_object('alreadyOwned',true,'theme_key',p_theme);end if;
 select * into v_order from public.hr_theme_orders where discord_id=p_discord_id and theme_key=p_theme and status in ('pending','processing');
 if found then return to_jsonb(v_order)-'gateway_token'-'email';end if;
 select * into v_product from public.hr_theme_catalog where key=p_theme;
 if not found then raise exception '找不到主題';end if;
 if v_product.sale_ends_at is not null and now()>v_product.sale_ends_at then raise exception '此限定主題已停止販售';end if;
 if not exists(select 1 from public.qiunai_staff where discord_id=p_discord_id and is_active is distinct from false) and not exists(select 1 from public.players where discord_id=p_discord_id and is_active is distinct from false) then raise exception '沒有在職員工權限';end if;
 if p_method='ecpay' and (p_merchant_id is null or p_trade_no is null or p_trade_no!~'^HT[A-F0-9]{18}$' or p_email is null) then raise exception '綠界付款資料無效';end if;
 if p_method='salary' then
  if p_department is null or p_department not in ('qiunai','deepnight') then raise exception '請選擇扣薪部門';end if;
  perform pg_advisory_xact_lock(hashtextextended('salary-asd:'||p_department||':'||p_discord_id,0));
  if p_department='qiunai' then select to_jsonb(s) into v_staff from public.qiunai_staff s where discord_id=p_discord_id and is_active is distinct from false for update; v_table:='qiunai_staff_bonus';
  else select to_jsonb(s) into v_staff from public.players s where discord_id=p_discord_id and is_active is distinct from false for update;v_table:='players_bonus';end if;
  if v_staff is null then raise exception '你沒有此部門的在職員工權限';end if;
  select coalesce((select sum(amount) from public.salary_wallet_entries where app_key=p_department and discord_id=p_discord_id and settlement_date>='2026-07-17'),0)
   -coalesce((select sum(amount) from public.salary_withdraw_requests where app_key=p_department and discord_id=p_discord_id and status in ('pending','approved') and requested_at>='2026-07-17T00:00:00+08:00'),0) into v_available;
  if floor(v_available)<v_product.price then raise exception '部門可用薪資不足，尚未扣款';end if;
 end if;
 if p_method='asd' then
  select coins into v_balance from public.users where user_id=p_discord_id for update;
  if v_balance is null or v_balance<v_product.price then raise exception 'ASD 餘額不足，尚未扣款';end if;
 end if;
 insert into public.hr_theme_orders(id,discord_id,theme_key,payment_method,amount,department,merchant_id,merchant_trade_no,email,status,paid_at)
 values(p_request_id,p_discord_id,p_theme,p_method,v_product.price,p_department,p_merchant_id,p_trade_no,p_email,case when p_method='ecpay' then 'pending' else 'paid' end,case when p_method='ecpay' then null else now() end) returning * into v_order;
 v_label:='HR 主題購買｜'||v_product.name||'｜'||p_request_id::text;
 if p_method='salary' then
  v_period:='theme-'||to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD');
  if p_department='qiunai' then insert into public.qiunai_staff_bonus(id,discord_id,staff_name,title,amount,note,wallet_settled_at,wallet_period_key) values(v_bonus,p_discord_id,coalesce(v_staff->>'display_name',p_discord_id),'主題購買：'||v_product.name,-v_product.price,v_label,now(),v_period);
  else insert into public.players_bonus(id,discord_id,staff_name,bonus_type,description,amount,wallet_settled_at,wallet_period_key) values(v_bonus,p_discord_id,coalesce(v_staff->>'display_name',p_discord_id),'主題購買',v_label,-v_product.price,now(),v_period);end if;
  insert into public.salary_wallet_entries(app_key,discord_id,staff_name,entry_type,amount,source_table,source_id,source_label,period_key,settlement_date,metadata)
   values(p_department,p_discord_id,coalesce(v_staff->>'display_name',p_discord_id),'staff_bonus',-v_product.price,v_table,v_bonus::text,v_label,v_period,(now() at time zone 'Asia/Taipei')::date,jsonb_build_object('theme_order_id',p_request_id,'theme_key',p_theme,'manual',true,'selected_type','deduction'));
 elsif p_method='asd' then
  update public.users set coins=coins-v_product.price where user_id=p_discord_id;
  insert into public.wallet_logs(user_id,type,amount,balance,note) values(p_discord_id,'主題購買',-v_product.price,v_balance-v_product.price,v_label);
 end if;
 if p_method<>'ecpay' then insert into public.hr_theme_entitlements(discord_id,theme_key,order_id) values(p_discord_id,p_theme,p_request_id);end if;
 return to_jsonb(v_order)-'gateway_token'-'email';
end $$;

create or replace function public.hr_complete_theme_payment(p_trade_no text,p_merchant_id text,p_gateway_trade_no text,p_amount integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.hr_theme_orders%rowtype;
begin
 select * into v_order from public.hr_theme_orders where merchant_trade_no=p_trade_no for update;
 if not found or v_order.payment_method<>'ecpay' or v_order.merchant_id is distinct from p_merchant_id or v_order.amount<>p_amount or nullif(p_gateway_trade_no,'') is null then raise exception '主題付款訂單不符';end if;
 if v_order.status='paid' then
  if v_order.gateway_trade_no is distinct from p_gateway_trade_no then raise exception '交易編號不符';end if;
  return jsonb_build_object('paid',true,'theme_key',v_order.theme_key);
 end if;
 if v_order.status='cancelled' then raise exception '已取消的訂單收到付款，請聯繫客服核對';end if;
 update public.hr_theme_orders set status='paid',paid_at=now(),gateway_trade_no=p_gateway_trade_no,gateway_token=null,reason=null where id=v_order.id;
 insert into public.hr_theme_entitlements(discord_id,theme_key,order_id) values(v_order.discord_id,v_order.theme_key,v_order.id) on conflict(discord_id,theme_key) do nothing;
 return jsonb_build_object('paid',true,'theme_key',v_order.theme_key);
end $$;

create or replace function public.hr_apply_theme(p_discord_id text,p_theme text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_theme not in ('qiunai','deepnight') and not exists(select 1 from public.hr_theme_entitlements where discord_id=p_discord_id and theme_key=p_theme) then raise exception '請先完成付款才能套用此主題';end if;
 insert into public.hr_theme_preferences(discord_id,theme_key) values(p_discord_id,p_theme) on conflict(discord_id) do update set theme_key=excluded.theme_key,updated_at=now();
end $$;
revoke all on function public.hr_buy_theme_atomic(text,text,text,uuid,text,text,text,text),public.hr_complete_theme_payment(text,text,text,integer),public.hr_apply_theme(text,text) from public,anon,authenticated;
grant execute on function public.hr_buy_theme_atomic(text,text,text,uuid,text,text,text,text),public.hr_complete_theme_payment(text,text,text,integer),public.hr_apply_theme(text,text) to service_role;
commit;
