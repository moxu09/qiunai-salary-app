begin;
create table public.hr_account_links (
 primary_id text not null check (primary_id ~ '^[0-9]{17,20}$'),
 alternate_id text not null check (alternate_id ~ '^[0-9]{17,20}$'),
 created_at timestamptz not null default now(),
 verified_at timestamptz,
 verified_departments text[] not null default '{}',
 primary key (primary_id, alternate_id),
 check (primary_id <> alternate_id)
);
create unique index hr_account_links_one_owner on public.hr_account_links (alternate_id) where verified_at is not null;
create index hr_account_links_incoming on public.hr_account_links (alternate_id);
alter table public.hr_account_links enable row level security;
revoke all on public.hr_account_links from public, anon, authenticated;
grant select on public.hr_account_links to service_role;
create table public.hr_account_link_audit (
 id bigint generated always as identity primary key,
 primary_id text not null,
 alternate_id text not null,
 actor_id text not null,
 action text not null check (action in ('confirmed','removed')),
 created_at timestamptz not null default now()
);
alter table public.hr_account_link_audit enable row level security;
revoke all on public.hr_account_link_audit from public, anon, authenticated;
grant select on public.hr_account_link_audit to service_role;

-- Both actors arrive from verified HR sessions. Only the target can approve.
create function public.hr_change_account_link(p_actor text, p_other text, p_action text, p_departments text[])
returns void language plpgsql security definer set search_path=public as $$
declare v_primary text; v_alternate text;
begin
 if p_actor is null or p_other is null or p_actor !~ '^[0-9]{17,20}$'
  or p_other !~ '^[0-9]{17,20}$' or p_actor=p_other then raise exception '請輸入另一個有效的 Discord ID';end if;
 perform pg_advisory_xact_lock(hashtextextended('hr-account-links',0));
 if p_action='remove' then
  with removed as (
   delete from public.hr_account_links
   where (primary_id=p_actor and alternate_id=p_other) or (primary_id=p_other and alternate_id=p_actor)
   returning *
  )
  insert into public.hr_account_link_audit(primary_id,alternate_id,actor_id,action)
   select primary_id,alternate_id,p_actor,'removed' from removed where verified_at is not null;
  return;
 end if;
 if p_action='request' then v_primary:=p_actor;v_alternate:=p_other;
 elsif p_action='confirm' then v_primary:=p_other;v_alternate:=p_actor;
 else raise exception '操作無效';end if;
 if exists(select 1 from public.hr_account_links where verified_at is not null and
  (alternate_id=v_primary or primary_id=v_alternate or (alternate_id=v_alternate and primary_id<>v_primary)))
 then raise exception '這個帳號已有其他綁定，請先解除';end if;
 if p_action='request' then
  delete from public.hr_account_links where primary_id=v_primary and verified_at is null and created_at <= now()-interval '24 hours';
  if exists(select 1 from public.hr_account_links where primary_id=v_primary and alternate_id=v_alternate) then return;end if;
  if (select count(*) from public.hr_account_links where primary_id=v_primary)>=2 then raise exception '最多可綁定兩組小號（含待確認）';end if;
  insert into public.hr_account_links(primary_id,alternate_id) values(v_primary,v_alternate);
 else
  if coalesce(cardinality(p_departments),0) not between 1 and 2
   or not (p_departments <@ array['qiunai','deepnight']::text[])
  then raise exception '找不到小號的在職部門';end if;
  update public.hr_account_links set verified_at=now(), verified_departments=p_departments
   where primary_id=v_primary and alternate_id=v_alternate and verified_at is null and created_at>now()-interval '24 hours';
  if not found then raise exception '這筆申請已失效，請主帳號重新申請';end if;
  insert into public.hr_account_link_audit(primary_id,alternate_id,actor_id,action)
   values(v_primary,v_alternate,p_actor,'confirmed');
  delete from public.hr_account_links where verified_at is null and
   (primary_id=v_alternate or alternate_id=v_alternate or alternate_id=v_primary);
 end if;
end $$;
revoke all on function public.hr_change_account_link(text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.hr_change_account_link(text,text,text,text[]) to service_role;

create function public.hr_request_linked_withdrawal_atomic(p_discord_id text,p_batch_id uuid,p_sources jsonb,p_destination text,p_payload jsonb,p_start_date date default '2026-07-17')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_source record; v_owner text; v_by_store jsonb:='{}'::jsonb; v_key text; v_amount integer; v_total integer:=0; v_available numeric; v_staff jsonb; v_fee integer;v_count integer;v_id uuid;
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
   if nullif(trim(v_staff->>'bank_name'),'') is null or nullif(trim(v_staff->>'bank_account'),'') is null then raise exception '請先填寫銀行資料';end if;
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
