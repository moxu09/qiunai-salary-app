-- Explicitly reviewed, service-only historical correction; no automatic backfill.
begin;
create table public.deepnight_commission_repairs (
 request_id uuid primary key, discord_id text not null, cutoff timestamptz not null,
 expected_plan jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table public.deepnight_commission_repairs enable row level security;
revoke all on public.deepnight_commission_repairs from public,anon,authenticated,service_role;
grant select on public.deepnight_commission_repairs to service_role;

create function public.repair_deepnight_commission_95(
 p_discord_id text, p_cutoff timestamptz, p_request_id uuid,
 p_expected_plan jsonb default null, p_apply boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.play_orders%rowtype; prior public.deepnight_commission_repairs%rowtype;
 plan jsonb:='[]'::jsonb; item jsonb; ledger jsonb; family text; base_salary numeric;
 correction numeric; target_salary numeric; missing_base numeric; total numeric:=0;
 inserted_count integer:=0; updated_count integer:=0; result jsonb;
begin
 if p_discord_id is null or p_discord_id!~'^[0-9]{17,20}$' or p_cutoff is null
   or p_request_id is null or p_cutoff>now() then raise exception '修正參數無效'; end if;
 perform pg_advisory_xact_lock(hashtextextended('salary-asd:deepnight:'||p_discord_id,0));
 select * into prior from public.deepnight_commission_repairs where request_id=p_request_id;
 if found then
  if prior.discord_id<>p_discord_id or prior.cutoff<>p_cutoff or
    (p_apply and prior.expected_plan is distinct from p_expected_plan) then
    raise exception '修正識別碼已用於不同資料'; end if;
  return jsonb_build_object('alreadyApplied',true,'additionalCredit',0,'originalResult',prior.result);
 end if;
 if not exists(select 1 from public.players where discord_id=p_discord_id and commission_tier='manager_95') then
  raise exception '員工目前不是手動 95%%'; end if;
 if p_apply then
  -- Legacy wallet writers do not all take the advisory lock. Lock ledger first,
  -- then source rows in UUID order, so comparison and credits share one snapshot.
  lock table public.salary_wallet_entries in share row exclusive mode;
  lock table public.play_orders in share row exclusive mode;
  perform 1 from public.play_orders where discord_id=p_discord_id and (created_at at time zone 'UTC')<=p_cutoff order by id for update;
 end if;
 for r in select o.* from public.play_orders o where o.discord_id=p_discord_id
   and (o.guild_id='1501098191813214312' or o.guild_id is null) and (o.created_at at time zone 'UTC')<=p_cutoff
   and not coalesce(o.is_deleted,false) and o.review_decision is distinct from 'rejected'
   and o.status in ('completed','已完成','已入帳','已發薪','未入帳','未發薪')
   and not exists(select 1 from public.play_orders w where not coalesce(w.is_deleted,false)
     and lower(substring(coalesce(nullif(w.order_id,''),nullif(w.order_no,'')) from '(?i)^WORK-([0-9a-f-]{36})-[0-9]+$'))=o.id::text)
   order by o.id
 loop
  if coalesce(r.order_amount,r.price,0)<=0 or coalesce(r.bonus_amount,0)<>0
    or r.staff_salary is null or r.staff_salary<=0 or r.staff_salary>round(coalesce(r.order_amount,r.price)*0.95)
    or r.wallet_settled_at is null or r.wallet_settled_at<'2026-07-17T00:00:00+08:00'::timestamptz
    or r.wallet_settled_at>now() or nullif(r.wallet_period_key,'') is null then
   raise exception '來源 % 需要個別人工核對',r.id; end if;
  family:=lower(substring(coalesce(nullif(r.order_id,''),nullif(r.order_no,''),'') from '(?i)^WORK-([0-9a-f-]{36})-[0-9]+$'));
  if family is not null then
   if lower(coalesce(nullif(r.order_id,''),nullif(r.order_no,'')))<>lower('WORK-'||family||'-'||p_discord_id) then
    raise exception '正式報單員工不一致'; end if;
   if (select count(*) from public.play_orders w where w.discord_id=p_discord_id and not coalesce(w.is_deleted,false)
      and lower(substring(coalesce(nullif(w.order_id,''),nullif(w.order_no,'')) from '(?i)^WORK-([0-9a-f-]{36})-[0-9]+$'))=lower(family))<>1 then
    raise exception '同一來源有多筆正式報單'; end if;
   if exists(select 1 from public.salary_wallet_entries e where e.app_key='deepnight' and e.amount<>0 and
      ((e.source_table='play_orders' and e.source_id=family) or e.metadata->>'target_order_id'=family)) then
    raise exception '原始訂單也有入帳，不可自動補款'; end if;
  end if;
  -- Include correction metadata even when another tool used an operation key as source_id.
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) into ledger
   from public.salary_wallet_entries e where
    (e.source_table='play_orders' and e.source_id=r.id::text)
    or e.metadata->>'target_order_id'=r.id::text;
  if exists(select 1 from jsonb_array_elements(ledger) e where
     e->>'app_key'<>'deepnight' or e->>'discord_id'<>p_discord_id
     or e->>'source_table'<>'play_orders' or e->>'entry_type' not in ('order_salary','order_bonus')
     or (e->>'amount')::numeric<0
     or (e->>'entry_type'='order_salary' and (e->>'amount')::numeric=0)) then raise exception '來源已有修正或沖銷，需人工核對'; end if;
  select coalesce(sum((e->>'amount')::numeric),0) into base_salary
    from jsonb_array_elements(ledger) e where e->>'entry_type'='order_salary';
  if base_salary<>0 and base_salary<>r.staff_salary then raise exception '帳本與來源薪資不同'; end if;
  target_salary:=round(coalesce(r.order_amount,r.price)*0.95);
  missing_base:=case when base_salary=0 then r.staff_salary else 0 end;
  correction:=target_salary-r.staff_salary;
  item:=jsonb_build_object('source',to_jsonb(r),'ledger',ledger,'targetSalary',target_salary,
    'missingBase',missing_base,'rateDifference',correction,'additionalCredit',missing_base+correction);
  plan:=plan||jsonb_build_array(item); total:=total+missing_base+correction;
 end loop;
 result:=jsonb_build_object('discordId',p_discord_id,'rate',95,'orderCount',jsonb_array_length(plan),
   'additionalCredit',total,'plan',plan);
 if p_apply is not true then return result; end if;
 if plan is distinct from p_expected_plan then raise exception '試算後資料已變更，請重新核對'; end if;
 if jsonb_array_length(plan)=0 then raise exception '沒有可修正的訂單'; end if;
 for item in select value from jsonb_array_elements(plan) loop
  if (item->>'missingBase')::numeric>0 then
   insert into public.salary_wallet_entries(app_key,discord_id,staff_name,entry_type,amount,
    source_table,source_id,source_label,period_key,settlement_date,metadata)
   values('deepnight',p_discord_id,item#>>'{source,staff_name}','order_salary',(item->>'missingBase')::numeric,
    'play_orders',item#>>'{source,id}','補回漏入帳薪資',item#>>'{source,wallet_period_key}',
    (now() at time zone 'Asia/Taipei')::date,jsonb_build_object('repair_request_id',p_request_id,
     'repair','missing-settled-salary','target_order_id',item#>>'{source,id}',
     'original_wallet_settled_at',item#>>'{source,wallet_settled_at}'));
   inserted_count:=inserted_count+1;
  end if;
  if (item->>'rateDifference')::numeric>0 then
   insert into public.salary_wallet_entries(app_key,discord_id,staff_name,entry_type,amount,
    source_table,source_id,source_label,period_key,settlement_date,metadata)
   values('deepnight',p_discord_id,item#>>'{source,staff_name}','salary_correction',(item->>'rateDifference')::numeric,
    'play_orders',item#>>'{source,id}','手動 95% 歷史抽成補差',item#>>'{source,wallet_period_key}',
    (now() at time zone 'Asia/Taipei')::date,jsonb_build_object('repair_request_id',p_request_id,
     'target_order_id',item#>>'{source,id}','old_rate',item#>'{source,salary_rate}','new_rate',95,
     'old_salary',item#>'{source,staff_salary}','new_salary',item->'targetSalary'));
   inserted_count:=inserted_count+1;
  end if;
  update public.play_orders set salary_rate=95,staff_salary=(item->>'targetSalary')::integer,
    salary_level='手動抽成 95%｜歷史訂單校正',platform_expense=(item->>'targetSalary')::integer+coalesce(bonus_amount,0)
   where id=(item#>>'{source,id}')::uuid and
    (salary_rate is distinct from 95 or staff_salary is distinct from (item->>'targetSalary')::integer);
  updated_count:=updated_count+case when found then 1 else 0 end;
 end loop;
 result:=result-'plan'||jsonb_build_object('insertedEntries',inserted_count,'updatedOrders',updated_count);
 insert into public.deepnight_commission_repairs(request_id,discord_id,cutoff,expected_plan,result)
  values(p_request_id,p_discord_id,p_cutoff,plan,result);
 return result;
end $$;
revoke all on function public.repair_deepnight_commission_95(text,timestamptz,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.repair_deepnight_commission_95(text,timestamptz,uuid,jsonb,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
