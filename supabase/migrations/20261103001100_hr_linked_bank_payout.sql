begin;
-- Keep bank details out of employee-visible salary request rows and preserve
-- the exact payout destination even after profile changes or unlinking.
create table public.hr_bank_payout_details (
 request_id uuid primary key references public.salary_withdraw_requests(id),
 primary_discord_id text not null,
 bank_name text not null check (btrim(bank_name)<>''),
 bank_account text not null check (btrim(bank_account)<>'')
);
alter table public.hr_bank_payout_details enable row level security;
revoke all on public.hr_bank_payout_details from public,anon,authenticated;
grant select on public.hr_bank_payout_details to service_role;

create function public.hr_resolve_linked_bank(p_actor text)
returns table(owner_id text, bank_name text, bank_account text)
language sql stable set search_path=public as $$
 with owner as (
  select coalesce(
   (select l.primary_id from public.hr_account_links l where l.alternate_id=p_actor and l.verified_at is not null),
   (select p_actor where exists(select 1 from public.hr_account_links l where l.primary_id=p_actor and l.verified_at is not null))
  ) as id
 )
 select owner.id,bank.bank_name,bank.bank_account from owner left join lateral (
  select b.bank_name,b.bank_account from (
   select 1 as priority,s.bank_name,s.bank_account from public.qiunai_staff s where s.discord_id=owner.id and s.is_active is distinct from false
   union all
   select 2,p.bank_name,p.bank_account from public.players p where p.discord_id=owner.id and p.is_active is distinct from false
  ) b
  where nullif(btrim(b.bank_name),'') is not null and nullif(btrim(b.bank_account),'') is not null
  order by priority limit 1
 ) bank on true
$$;
revoke all on function public.hr_resolve_linked_bank(text) from public,anon,authenticated;
grant execute on function public.hr_resolve_linked_bank(text) to service_role;

create function public.hr_linked_bank_status(p_actor text)
returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('owner',owner_id,'ready',bank_account is not null)
 from public.hr_resolve_linked_bank(p_actor)
$$;
revoke all on function public.hr_linked_bank_status(text) from public,anon,authenticated;
grant execute on function public.hr_linked_bank_status(text) to service_role;

create or replace function public.hr_request_linked_withdrawal_atomic(p_discord_id text,p_batch_id uuid,p_sources jsonb,p_destination text,p_payload jsonb,p_start_date date default '2026-07-17')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_source record; v_payee record; v_owner text; v_by_store jsonb:='{}'::jsonb; v_key text; v_amount integer; v_total integer:=0; v_available numeric; v_staff jsonb; v_fee integer;v_count integer;v_id uuid;
 v_result jsonb:='[]'::jsonb;v_existing public.hr_withdrawal_batches%rowtype;
 v_local timestamp:=now() at time zone 'Asia/Taipei';v_start timestamptz:=p_start_date::timestamp at time zone 'Asia/Taipei';
begin
 if p_discord_id is null or p_discord_id!~'^\d{15,22}$' or p_batch_id is null or p_destination is null or p_payload is null or p_destination not in ('bank','asd') or jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 6 then raise exception '申請資料無效';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-batch:'||p_batch_id::text,0));
 select * into v_existing from public.hr_withdrawal_batches where id=p_batch_id;
 if found then
  if v_existing.discord_id<>p_discord_id or v_existing.request_payload<>p_payload then raise exception '申請識別碼已使用';end if;
  return v_existing.result;
 end if;
 if coalesce(p_payload->>'mode','') not in ('combined','separate') then raise exception '申請方式無效';end if;
 -- Keep link ownership stable until all sources commit. Lock salary sources in a
 -- deterministic order compatible with the existing single-account transaction.
 perform pg_advisory_xact_lock_shared(hashtextextended('hr-account-links',0));
 if p_destination='bank' then
  select * into v_payee from public.hr_resolve_linked_bank(p_discord_id);
  if coalesce(p_payload->>'bankOwner','')<>coalesce(v_payee.owner_id,'') then raise exception '收款帳號已變更，請重新讀取再送出';end if;
  if v_payee.owner_id is not null and v_payee.bank_account is null then raise exception '請先在主帳號填寫銀行資料';end if;
 end if;
 if (select count(*) from jsonb_to_recordset(p_sources) x(department text,owner text,amount integer,fee integer))
  <> (select count(distinct (department,owner)) from jsonb_to_recordset(p_sources) x(department text,owner text,amount integer,fee integer))
 then raise exception '申請來源重複';end if;
 for v_source in select * from jsonb_to_recordset(p_sources) x(department text,owner text,amount integer,fee integer) order by department,owner loop
  if v_source.department is null or v_source.department not in ('qiunai','deepnight')
   or v_source.owner is null or v_source.amount is null or v_source.amount<1 then raise exception '申請部門或金額無效';end if;
  if v_source.owner<>p_discord_id and not exists(select 1 from public.hr_account_links
   where primary_id=p_discord_id and alternate_id=v_source.owner and verified_at is not null
    and v_source.department=any(verified_departments))
  then raise exception '小號綁定已變更，請重新整理';end if;
  perform pg_advisory_xact_lock(hashtextextended('salary-asd:'||v_source.department||':'||v_source.owner,0));
 end loop;
 for v_source in select * from jsonb_to_recordset(p_sources) x(department text,owner text,amount integer,fee integer) order by department,owner loop
  v_key:=v_source.department;v_owner:=v_source.owner;v_amount:=v_source.amount;v_total:=v_total+v_amount;
  v_by_store:=jsonb_set(v_by_store,array[v_key],to_jsonb(coalesce((v_by_store->>v_key)::integer,0)+v_amount));
  if v_key='qiunai' then select to_jsonb(s) into v_staff from public.qiunai_staff s where discord_id=v_owner and is_active is distinct from false for update;
  else select to_jsonb(s) into v_staff from public.players s where discord_id=v_owner and is_active is distinct from false for update;end if;
  if v_staff is null then raise exception '你沒有此部門的在職員工權限';end if;
  select coalesce((select sum(amount) from public.salary_wallet_entries where app_key=v_key and discord_id=v_owner and settlement_date>=p_start_date),0)
  -coalesce((select sum(amount) from public.salary_withdraw_requests where app_key=v_key and discord_id=v_owner and status in ('pending','approved') and requested_at>=v_start),0) into v_available;
  if v_amount>floor(v_available) then raise exception '申請金額超過部門可提領餘額';end if;
  if p_destination='bank' then
   if v_local<date_trunc('month',v_local)+interval '4 days 9 hours' or v_local>date_trunc('month',v_local)+interval '24 days 15 hours 30 minutes' then raise exception '目前不在提領期間';end if;
   if v_payee.owner_id is null and (nullif(trim(v_staff->>'bank_name'),'') is null or nullif(trim(v_staff->>'bank_account'),'') is null) then raise exception '請先填寫銀行資料';end if;
   if exists(select 1 from public.salary_withdraw_requests where app_key=v_key and discord_id=v_owner and status='pending' and coalesce(destination,'bank')='bank') then raise exception '部門已有銀行提領等待審核';end if;
   select count(*) into v_count from public.salary_withdraw_requests where app_key=v_key and discord_id=v_owner
    and requested_at>=date_trunc('month',v_local) at time zone 'Asia/Taipei'
    and requested_at<(date_trunc('month',v_local)+interval '1 month') at time zone 'Asia/Taipei'
    and case when v_key='deepnight' then status='approved' and coalesce(destination,'bank')='bank' else status<>'rejected' end;
   v_fee:=case when v_count>0 then 15 else 0 end;
   if v_source.fee is distinct from v_fee then raise exception '手續費已變更，請重新讀取再送出';end if;
   if v_amount<=v_fee then raise exception '分配金額不足扣除部門手續費，請調整為分開輸入';end if;
   insert into public.salary_withdraw_requests(app_key,discord_id,staff_name,amount,service_fee,welfare_fee,payout_amount,status,destination,request_note)
    values(v_key,v_owner,coalesce(v_staff->>'display_name',v_staff->>'discord_name',v_owner),v_amount,v_fee,0,v_amount-v_fee,'pending','bank','HR 合併申請 '||p_batch_id::text) returning id into v_id;
   if v_payee.owner_id is not null then
    insert into public.hr_bank_payout_details(request_id,primary_discord_id,bank_name,bank_account)
    values(v_id,v_payee.owner_id,v_payee.bank_name,v_payee.bank_account);
   end if;
   v_result:=v_result||jsonb_build_array(jsonb_build_object('department',v_key,'discordId',v_owner,'requestId',v_id,'amount',v_amount,'serviceFee',v_fee,'payoutAmount',v_amount-v_fee,'status','pending'));
  else
   v_result:=v_result||jsonb_build_array(jsonb_build_object('department',v_key,'discordId',v_owner,'amount',v_amount,'serviceFee',0,'payoutAmount',v_amount,'transfer',public.transfer_salary_to_asd_atomic(v_key,v_owner,coalesce(v_staff->>'display_name',v_owner),v_amount,p_start_date,v_start)));
  end if;
 end loop;
 if v_total<1 or (p_destination='bank' and v_total<1001) then raise exception '申請金額不足';end if;
 if p_payload->>'mode'='separate' and p_destination='bank' and exists(select 1 from jsonb_each_text(v_by_store) where value::integer<1001)
 then raise exception '分開提領每個部門金額需高於 1,000 元';end if;
 insert into public.hr_withdrawal_batches(id,discord_id,request_payload,result)values(p_batch_id,p_discord_id,p_payload,v_result);
 return v_result;
end $$;
revoke all on function public.hr_request_linked_withdrawal_atomic(text,uuid,jsonb,text,jsonb,date) from public,anon,authenticated;
grant execute on function public.hr_request_linked_withdrawal_atomic(text,uuid,jsonb,text,jsonb,date) to service_role;
notify pgrst, 'reload schema';
commit;
