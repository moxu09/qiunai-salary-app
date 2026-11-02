begin;
-- No existing employee, wallet or order is moved. New requests keep their app_key.
create table if not exists public.hr_withdrawal_batches (
 id uuid primary key,
 discord_id text not null,
 request_payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.hr_withdrawal_batches enable row level security;
revoke all on public.hr_withdrawal_batches from public,anon,authenticated;
grant select,insert on public.hr_withdrawal_batches to service_role;

-- Serialize new reservations with the existing ASD function, including old clients.
create or replace function public.hr_guard_salary_reservation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_available numeric;
begin
 if new.app_key not in ('qiunai','deepnight') or new.status not in ('pending','approved') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('salary-asd:'||new.app_key||':'||new.discord_id,0));
 select coalesce((select sum(amount) from public.salary_wallet_entries where app_key=new.app_key and discord_id=new.discord_id and settlement_date>='2026-07-17'::date),0)
 -coalesce((select sum(amount) from public.salary_withdraw_requests where app_key=new.app_key and discord_id=new.discord_id and status in ('pending','approved') and requested_at>='2026-07-17T00:00:00+08:00'::timestamptz),0) into v_available;
 if new.amount<1 or new.amount>floor(v_available) then raise exception '申請金額超過部門可提領餘額';end if;
 return new;
end $$;
drop trigger if exists hr_salary_reservation_guard on public.salary_withdraw_requests;
create trigger hr_salary_reservation_guard before insert on public.salary_withdraw_requests for each row execute function public.hr_guard_salary_reservation();

create or replace function public.hr_update_profile_atomic(p_discord_id text,p_profile jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_discord_id is null or p_discord_id!~'^\d{15,22}$' then raise exception '員工身分無效';end if;
 update public.players set real_name=p_profile->>'real_name',phone=p_profile->>'phone',gender=p_profile->>'gender',birthday=nullif(p_profile->>'birthday','')::date,bank_name=p_profile->>'bank_name',bank_account=p_profile->>'bank_account',updated_at=now() where discord_id=p_discord_id and is_active is distinct from false;
 update public.qiunai_staff set real_name=p_profile->>'real_name',phone=p_profile->>'phone',gender=p_profile->>'gender',birthday=nullif(p_profile->>'birthday','')::date,bank_name=p_profile->>'bank_name',bank_account=p_profile->>'bank_account',updated_at=now() where discord_id=p_discord_id and is_active is distinct from false;
end $$;

create or replace function public.hr_request_withdrawal_atomic(p_discord_id text,p_batch_id uuid,p_amounts jsonb,p_destination text,p_payload jsonb,p_start_date date default '2026-07-17')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_key text; v_amount integer; v_total integer:=0; v_available numeric; v_staff jsonb; v_fee integer;v_count integer;v_id uuid;
 v_result jsonb:='[]'::jsonb;v_existing public.hr_withdrawal_batches%rowtype;
 v_local timestamp:=now() at time zone 'Asia/Taipei';v_start timestamptz:=p_start_date::timestamp at time zone 'Asia/Taipei';
begin
 if p_discord_id is null or p_discord_id!~'^\d{15,22}$' or p_batch_id is null or p_destination not in ('bank','asd') or p_amounts is null or jsonb_typeof(p_amounts)<>'object' then raise exception '申請資料無效';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-batch:'||p_batch_id::text,0));
 select * into v_existing from public.hr_withdrawal_batches where id=p_batch_id;
 if found then
  if v_existing.discord_id<>p_discord_id or v_existing.request_payload<>p_payload then raise exception '申請識別碼已使用';end if;
  return v_existing.result;
 end if;
 if p_payload->>'mode' not in ('combined','separate') then raise exception '申請方式無效';end if;
 -- Acquire every department lock before touching the shared ASD wallet.
 for v_key in select jsonb_object_keys(p_amounts) order by 1 loop
  if v_key not in ('qiunai','deepnight') or (p_amounts->>v_key)!~'^\d+$' then raise exception '申請部門或金額無效';end if;
  if (p_amounts->>v_key)::integer>0 then perform pg_advisory_xact_lock(hashtextextended('salary-asd:'||v_key||':'||p_discord_id,0));end if;
 end loop;
 for v_key in select jsonb_object_keys(p_amounts) order by 1 loop
  if v_key not in ('qiunai','deepnight') or (p_amounts->>v_key)!~'^\d+$' then raise exception '申請部門或金額無效';end if;
  v_amount:=(p_amounts->>v_key)::integer;v_total:=v_total+v_amount;
  if v_amount=0 then continue;end if;
  perform pg_advisory_xact_lock(hashtextextended('salary-asd:'||v_key||':'||p_discord_id,0));
  if v_key='qiunai' then select to_jsonb(s) into v_staff from public.qiunai_staff s where discord_id=p_discord_id and is_active is distinct from false for update;
  else select to_jsonb(s) into v_staff from public.players s where discord_id=p_discord_id and is_active is distinct from false for update;end if;
  if v_staff is null then raise exception '你沒有此部門的在職員工權限';end if;
  select coalesce((select sum(amount) from public.salary_wallet_entries where app_key=v_key and discord_id=p_discord_id and settlement_date>=p_start_date),0)
  -coalesce((select sum(amount) from public.salary_withdraw_requests where app_key=v_key and discord_id=p_discord_id and status in ('pending','approved') and requested_at>=v_start),0) into v_available;
  if v_amount>floor(v_available) then raise exception '申請金額超過部門可提領餘額';end if;
  if p_destination='bank' then
   if v_local<date_trunc('month',v_local)+interval '4 days 9 hours' or v_local>date_trunc('month',v_local)+interval '24 days 15 hours 30 minutes' then raise exception '目前不在提領期間';end if;
   if p_payload->>'mode'='separate' and v_amount<1001 then raise exception '分開提領每個部門金額需高於 1,000 元';end if;
   if nullif(trim(v_staff->>'bank_name'),'') is null or nullif(trim(v_staff->>'bank_account'),'') is null then raise exception '請先填寫銀行資料';end if;
   if exists(select 1 from public.salary_withdraw_requests where app_key=v_key and discord_id=p_discord_id and status='pending' and coalesce(destination,'bank')='bank') then raise exception '部門已有銀行提領等待審核';end if;
   select count(*) into v_count from public.salary_withdraw_requests where app_key=v_key and discord_id=p_discord_id
    and requested_at>=date_trunc('month',v_local) at time zone 'Asia/Taipei'
    and requested_at<(date_trunc('month',v_local)+interval '1 month') at time zone 'Asia/Taipei'
    and case when v_key='deepnight' then status='approved' and coalesce(destination,'bank')='bank' else status<>'rejected' end;
   v_fee:=case when v_count>0 then 15 else 0 end;
   if v_amount<=v_fee then raise exception '分配金額不足扣除部門手續費，請調整為分開輸入';end if;
   insert into public.salary_withdraw_requests(app_key,discord_id,staff_name,amount,service_fee,welfare_fee,payout_amount,status,destination,request_note)
    values(v_key,p_discord_id,coalesce(v_staff->>'display_name',v_staff->>'discord_name',p_discord_id),v_amount,v_fee,0,v_amount-v_fee,'pending','bank','HR 合併申請 '||p_batch_id::text) returning id into v_id;
   v_result:=v_result||jsonb_build_array(jsonb_build_object('department',v_key,'requestId',v_id,'amount',v_amount,'serviceFee',v_fee,'payoutAmount',v_amount-v_fee,'status','pending'));
  else
   v_result:=v_result||jsonb_build_array(jsonb_build_object('department',v_key,'amount',v_amount,'serviceFee',0,'payoutAmount',v_amount,'transfer',public.transfer_salary_to_asd_atomic(v_key,p_discord_id,coalesce(v_staff->>'display_name',p_discord_id),v_amount,p_start_date,v_start)));
  end if;
 end loop;
 if v_total<1 or (p_destination='bank' and v_total<1001) then raise exception '申請金額不足';end if;
 insert into public.hr_withdrawal_batches(id,discord_id,request_payload,result)values(p_batch_id,p_discord_id,p_payload,v_result);
 return v_result;
end $$;
revoke all on function public.hr_guard_salary_reservation() from public,anon,authenticated;
revoke all on function public.hr_update_profile_atomic(text,jsonb) from public,anon,authenticated;
revoke all on function public.hr_request_withdrawal_atomic(text,uuid,jsonb,text,jsonb,date) from public,anon,authenticated;
grant execute on function public.hr_update_profile_atomic(text,jsonb) to service_role;
grant execute on function public.hr_request_withdrawal_atomic(text,uuid,jsonb,text,jsonb,date) to service_role;
commit;
