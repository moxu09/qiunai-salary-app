begin;
set local lock_timeout = '5s';

create table public.hr_contract_deposit_payments (
  trade_no text primary key check (trade_no ~ '^HD[A-F0-9]{18}$'),
  signing_id uuid not null references public.hr_document_signings(id),
  method text not null check (method in ('ecpay', 'jkopay')),
  merchant_id text not null,
  amount integer not null default 1000 check (amount = 1000),
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'processing', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  last_checked_at timestamptz,
  gateway_payload text,
  gateway_trade_no text,
  paid_at timestamptz,
  unique (method, merchant_id, gateway_trade_no)
);
create unique index hr_contract_one_current_deposit
  on public.hr_contract_deposit_payments(signing_id) where status <> 'failed';

alter table public.hr_contract_deposit_payments enable row level security;
revoke all on public.hr_contract_deposit_payments from public, anon, authenticated, service_role;
grant select, update on public.hr_contract_deposit_payments to service_role;

create function public.hr_start_contract_deposit(
  p_discord_id text, p_trade_no text, p_method text, p_merchant_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  signing public.hr_document_signings%rowtype;
  payment public.hr_contract_deposit_payments%rowtype;
begin
  select * into signing from public.hr_document_signings
  where discord_id = p_discord_id and document_key = 'employment-v22' and signed_at is not null
  for update;
  if not found or not signing.deposit_required then raise exception '這份契約無須繳交保證金'; end if;
  if signing.deposit_paid_at is not null then return jsonb_build_object('status','paid'); end if;

  -- A station-payment token cannot charge without our server submitting it.
  -- Expire unsubmitted sessions only; a submitted or external checkout remains reserved.
  update public.hr_contract_deposit_payments set status = 'failed', gateway_payload = null
  where signing_id = signing.id and method = 'ecpay' and status in ('preparing', 'ready')
    and (method <> p_method or created_at <= now() - interval '25 minutes');
  select * into payment from public.hr_contract_deposit_payments
  where signing_id = signing.id and status <> 'failed';
  if found then return to_jsonb(payment) || jsonb_build_object('created',false); end if;
  insert into public.hr_contract_deposit_payments(trade_no, signing_id, method, merchant_id)
  values(p_trade_no, signing.id, p_method, p_merchant_id) returning * into payment;
  return to_jsonb(payment) || jsonb_build_object('created',true);
end;
$$;

create function public.hr_confirm_contract_deposit(
  p_trade_no text, p_method text, p_merchant_id text, p_gateway_trade_no text, p_amount integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  payment public.hr_contract_deposit_payments%rowtype;
  paid_time timestamptz := now();
begin
  select * into payment from public.hr_contract_deposit_payments where trade_no = p_trade_no;
  if not found then raise exception '找不到保證金付款單'; end if;
  perform 1 from public.hr_document_signings where id = payment.signing_id and deposit_required for update;
  if not found then raise exception '找不到應付款契約'; end if;
  select * into payment from public.hr_contract_deposit_payments where trade_no = p_trade_no for update;
  if payment.method <> p_method or payment.merchant_id <> p_merchant_id
    or p_amount is distinct from payment.amount or nullif(btrim(p_gateway_trade_no),'') is null
    then raise exception '保證金交易資料不符'; end if;
  if payment.status = 'paid' then
    if payment.gateway_trade_no <> p_gateway_trade_no then raise exception '保證金交易編號不符'; end if;
    return;
  end if;
  if not ((p_method = 'ecpay' and payment.status = 'processing')
      or (p_method = 'jkopay' and payment.status in ('preparing', 'ready')))
    then raise exception '這筆保證金付款單尚未送出'; end if;
  update public.employment_contract_signings set status = 'signed', updated_at = paid_time
  where id = payment.signing_id and contract_version = 'v2.2' and status = 'signing';
  if not found then raise exception '契約開通狀態不符'; end if;
  update public.hr_document_signings set deposit_paid_at = paid_time
  where id = payment.signing_id and deposit_paid_at is null;
  if not found then raise exception '契約保證金已確認'; end if;
  update public.hr_contract_deposit_payments set status = 'paid', paid_at = paid_time,
    gateway_trade_no = p_gateway_trade_no, gateway_payload = null where trade_no = p_trade_no;
end;
$$;

revoke all on function public.hr_start_contract_deposit(text,text,text,text),
  public.hr_confirm_contract_deposit(text,text,text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_start_contract_deposit(text,text,text,text),
  public.hr_confirm_contract_deposit(text,text,text,text,integer) to service_role;

notify pgrst, 'reload schema';
commit;
