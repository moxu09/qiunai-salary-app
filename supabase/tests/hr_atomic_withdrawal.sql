begin;
create temporary table hr_verification(check_name text, passed boolean);
do $test$
declare
 actor text:='999999999999990001'; batch uuid:='00000000-0000-4000-8000-000000000001';
 payload jsonb:='{"mode":"combined","destination":"asd","total":1500,"amounts":null}';
 result jsonb; first_balance integer; after_balance integer; request_count integer;
begin
 if exists(select 1 from users where user_id=actor) or exists(select 1 from qiunai_staff where discord_id=actor) or exists(select 1 from players where discord_id=actor) then raise exception '測試帳號已存在，停止';end if;
 insert into qiunai_staff(discord_id,display_name,is_active,bank_name,bank_account) values(actor,'HR rollback test',true,'test','000');
 insert into players(discord_id,display_name,is_active,bank_name,bank_account) values(actor,'HR rollback test',true,'test','000');
 insert into salary_wallet_entries(app_key,discord_id,entry_type,amount,source_table,source_id,period_key,settlement_date)
 values('qiunai',actor,'staff_bonus',3000,'hr_rollback_test','qiunai','hr-test',current_date),('deepnight',actor,'staff_bonus',6000,'hr_rollback_test','deepnight','hr-test',current_date);
 result:=hr_request_withdrawal_atomic(actor,batch,'{"qiunai":500,"deepnight":1000}','asd',payload,'2026-07-17');
 select coins into first_balance from users where user_id=actor;
 if first_balance<>1500 or jsonb_array_length(result)<>2 then raise exception '合併交易結果錯誤';end if;
 insert into hr_verification values('combined ASD keeps both department allocations',true);
 result:=hr_request_withdrawal_atomic(actor,batch,'{"qiunai":500,"deepnight":1000}','asd',payload,'2026-07-17');
 select coins into after_balance from users where user_id=actor;
 if after_balance<>first_balance then raise exception '重試重複入帳';end if;
 insert into hr_verification values('same request is idempotent',true);
 begin
  perform hr_request_withdrawal_atomic(actor,batch,'{"qiunai":600}','asd','{"mode":"separate"}','2026-07-17');
  raise exception 'TEST EXPECTED REJECTION';
 exception when others then if sqlerrm='TEST EXPECTED REJECTION' then raise;end if;end;
 insert into hr_verification values('changed payload cannot reuse idempotency key',true);
 select count(*) into request_count from salary_withdraw_requests where discord_id=actor;
 begin
  -- Alphabetical department order mutates DeepNight before Qiunai fails; the entire call must roll back.
  perform hr_request_withdrawal_atomic(actor,'00000000-0000-4000-8000-000000000002','{"deepnight":100,"qiunai":999999}','asd',payload,'2026-07-17');
  raise exception 'TEST EXPECTED REJECTION';
 exception when others then if sqlerrm='TEST EXPECTED REJECTION' then raise;end if;end;
 select coins into after_balance from users where user_id=actor;
 if after_balance<>first_balance or (select count(*) from salary_withdraw_requests where discord_id=actor)<>request_count then raise exception '部分失敗未回滾';end if;
 insert into hr_verification values('partial failure rolls back both wallets and records',true);
 begin
  insert into salary_withdraw_requests(app_key,discord_id,staff_name,amount,status,destination)values('qiunai',actor,'test',999999,'pending','bank');
  raise exception 'TEST EXPECTED REJECTION';
 exception when others then if sqlerrm='TEST EXPECTED REJECTION' then raise;end if;end;
 insert into hr_verification values('legacy insert cannot overdraw a wallet',true);
 perform hr_update_profile_atomic(actor,'{"display_name":"same profile","_organizations":["qiunai","deepnight"],"real_name":"test","phone":"0900000000","gender":null,"birthday":"2000-01-01","bank_name":"new bank","bank_account":"new account","avatar_url":null}');
 if (select phone from qiunai_staff where discord_id=actor)<>'0900000000' or (select phone from players where discord_id=actor)<>'0900000000' then raise exception '個人資料未同步';end if;
 insert into hr_verification values('one profile updates only the same employee in both departments',true);
 if has_function_privilege('anon','hr_request_withdrawal_atomic(text,uuid,jsonb,text,jsonb,date)','execute') or has_function_privilege('authenticated','hr_request_withdrawal_atomic(text,uuid,jsonb,text,jsonb,date)','execute') then raise exception '瀏覽器角色可執行金額交易';end if;
 insert into hr_verification values('browser roles cannot execute privileged HR transactions',true);
end $test$;
select * from hr_verification;
rollback;
