import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const staff='123456789012345678',guild='1501098191813214312';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',request='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table players(id uuid primary key default gen_random_uuid(),discord_id text unique,commission_tier text,display_name text,real_name text,discord_name text);
 create table play_orders(id uuid primary key default gen_random_uuid(),discord_id text,assigned_player text,guild_id text,customer_id text not null,staff_name text,service_name text,service text not null,order_id text,order_no text,order_type text,status text,review_decision text,is_deleted boolean default false,order_amount integer,price integer,staff_salary integer,salary_rate integer,salary_level text,bonus_amount integer default 0,platform_income integer,platform_expense integer,created_at timestamp default now(),completed_at timestamp,order_finished_at timestamp,wallet_settled_at timestamptz,wallet_period_key text);
 create table salary_wallet_entries(id uuid primary key default gen_random_uuid(),app_key text,discord_id text,staff_name text,entry_type text,amount numeric,source_table text,source_id text,source_label text,period_key text,settlement_date date,metadata jsonb default '{}',created_at timestamptz default now(),unique(app_key,source_table,source_id,entry_type));
 create table salary_activity_commission_settings(app_key text,activity_rate numeric,starts_at timestamptz,ends_at timestamptz);
 insert into players(discord_id,commission_tier) values('${staff}','manager_95');`);
 for(const f of ['20261103000100_deepnight_manual_commission.sql','20261103000200_deepnight_commission_repair.sql','20261113000100_deepnight_commission_70_75.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 await db.exec('create trigger trg_sync_play_order_salary_fields before insert or update on play_orders for each row execute function sync_play_order_salary_fields()');return db;
}
async function insert(db,id=first,patch={}){
 const row={id,customer_id:"000000000000000000",service:"SQL 回歸測試",discord_id:staff,assigned_player:staff,guild_id:guild,order_amount:280,price:280,staff_salary:224,salary_rate:80,status:'completed',created_at:'2026-10-01',order_finished_at:'2026-10-01',...patch};
 const c=Object.keys(row);await db.query(`insert into play_orders(${c.join(',')}) values(${c.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));return(await db.query('select * from play_orders where id=$1',[id])).rows[0];
}
async function rpc(db,apply=false,plan=null,id=request){return(await db.query('select repair_deepnight_commission_95($1,$2,$3,$4,$5) result',[staff,'2026-11-02',id,plan,apply])).rows[0].result;}
test('manual wins over stale rates/opening/tips; other guild and auto preserved; changes audited',async()=>{
 const db=await fixture();try{
 assert.equal((await insert(db)).staff_salary,266);
 assert.equal((await insert(db,second,{created_at:'2026-08-01',order_finished_at:'2026-08-01'})).salary_rate,95);
 await db.exec('delete from play_orders');assert.equal((await insert(db,first,{order_type:'打賞'})).salary_rate,95);
 assert.equal((await insert(db,second,{guild_id:'other'})).salary_rate,80);
 await db.exec("delete from play_orders;update players set commission_tier='auto'");assert.equal((await insert(db)).salary_rate,80);
 assert.equal((await db.query('select * from deepnight_commission_audit')).rows.length,1);
 await db.exec("delete from play_orders;update players set commission_tier='rate_85'");assert.equal((await insert(db)).salary_rate,85);
 assert.equal((await insert(db,second,{order_type:'打賞'})).salary_rate,90);
 }finally{await db.close();}
});
test('70% and 75% apply to completed DeepNight orders and keep the standard tip rate', async () => {
  const db = await fixture();
  try {
    await db.exec(await readFile(new URL('../supabase/migrations/20261113000100_deepnight_commission_70_75.sql', import.meta.url), 'utf8'));
    for (const rate of [70, 75]) {
      await db.query('update players set commission_tier=$1', [`rate_${rate}`]);
      const order = await insert(db);
      assert.equal(order.salary_rate, rate);
      assert.equal(order.staff_salary, 280 * rate / 100);
      assert.equal((await insert(db, second, { order_type: '打賞' })).salary_rate, 90);
      await db.exec('delete from play_orders');
    }
  } finally {
    await db.close();
  }
});
test('settled/credited/draft/refunded/deleted/metadata-only/shadow rows are not repriced',async()=>{
 const db=await fixture();try{
 for(const patch of [{wallet_settled_at:'2026-10-02Z'},{status:'work_draft'},{status:'refunded'},{is_deleted:true}]){assert.equal((await insert(db,first,patch)).salary_rate,80);await db.exec('delete from play_orders');}
 await db.exec(`insert into salary_wallet_entries(app_key,discord_id,entry_type,amount,source_table,source_id) values('deepnight','${staff}','order_salary',224,'play_orders','${first}')`);
 assert.equal((await insert(db)).salary_rate,80);await db.exec('delete from salary_wallet_entries');
 await db.query('update play_orders set staff_name=$1 where id=$2',['renamed',first]);assert.equal((await db.query('select salary_rate from play_orders')).rows[0].salary_rate,80);
 await insert(db,second,{order_id:`WORK-${first}-${staff}`});
 await db.query('update play_orders set staff_salary=0,discord_id=null where id=$1',[first]);
 const raw=(await db.query('select * from play_orders where id=$1',[first])).rows[0];assert.equal(raw.staff_salary,0);assert.equal(raw.discord_id,null);
 }finally{await db.close();}
});
test('atomic missing base + difference; stale-plan rejection; originals immutable; retries do not credit',async()=>{
 const db=await fixture();try{
 await insert(db,first,{staff_salary:238,salary_rate:85,wallet_settled_at:'2026-11-01T16:00:00Z',wallet_period_key:'2026-10-H2'});
 await insert(db,second,{staff_salary:448,salary_rate:80,order_amount:560,price:560,wallet_settled_at:'2026-11-01T16:00:00Z',wallet_period_key:'2026-10-H2'});
 await db.exec(`insert into salary_wallet_entries(app_key,discord_id,entry_type,amount,source_table,source_id) values('deepnight','${staff}','order_salary',448,'play_orders','${second}')`);
 const preview=await rpc(db);assert.equal(preview.orderCount,2);assert.equal(preview.additionalCredit,350);
 await assert.rejects(()=>rpc(db,true,[]),/資料已變更/);assert.equal((await db.query('select count(*)::integer n from salary_wallet_entries')).rows[0].n,1);
 const applied=await rpc(db,true,preview.plan);assert.equal(applied.additionalCredit,350);assert.equal(applied.insertedEntries,3);
 assert.equal((await db.query("select amount from salary_wallet_entries where source_id=$1 and entry_type='order_salary'",[second])).rows[0].amount,'448');
 assert.equal((await db.query('select sum(amount) total from salary_wallet_entries')).rows[0].total,'798');
 assert.equal((await rpc(db,true,preview.plan)).additionalCredit,0);await assert.rejects(()=>rpc(db,true,[]),/不同資料/);
 await assert.rejects(()=>rpc(db,false,null,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),/已有修正/);
 }finally{await db.close();}
});
test('excludes raw shadow; rejects parent credit/reversal/pre-wallet markers; authenticated has no RPC access',async()=>{
 const db=await fixture();try{
 await insert(db,first,{staff_salary:0,wallet_settled_at:'2026-10-02Z',wallet_period_key:'2026-10-H1'});
 await insert(db,second,{order_id:`WORK-${first}-${staff}`,staff_salary:238,salary_rate:85,wallet_settled_at:'2026-10-02Z',wallet_period_key:'2026-10-H1'});assert.equal((await rpc(db)).orderCount,1);
 await db.exec(`insert into salary_wallet_entries(app_key,discord_id,entry_type,amount,source_table,source_id) values('deepnight','${staff}','order_salary',224,'play_orders','${first}')`);
 await assert.rejects(()=>rpc(db),/原始訂單也有入帳/);await db.exec('delete from salary_wallet_entries');
 await db.exec(`insert into salary_wallet_entries(app_key,discord_id,entry_type,amount,source_table,source_id) values('deepnight','${staff}','salary_correction',-10,'play_orders','${second}')`);
 await assert.rejects(()=>rpc(db),/已有修正/);await db.exec('delete from salary_wallet_entries');
 await db.query("update play_orders set wallet_settled_at='2026-06-01Z' where id=$1",[second]);await assert.rejects(()=>rpc(db),/人工核對/);
 await db.exec('set role authenticated');await assert.rejects(()=>rpc(db),/permission denied/);
 }finally{await db.close();}
});
test('opening minimum, campaign benefits, negative bonuses, and explicit per-order edits remain intact',async()=>{
 const db=await fixture();try{
 await db.exec("update players set commission_tier='rate_80'");
 assert.equal((await insert(db,first,{order_finished_at:'2026-08-15'})).salary_rate,90);
 await db.exec("delete from play_orders;update players set commission_tier='manager_95'");
 const r=await insert(db,first,{bonus_amount:-20});assert.equal(r.staff_salary,266);assert.equal(r.platform_expense,246);
 await db.query('update play_orders set staff_salary=0 where id=$1',[first]);assert.equal((await db.query('select staff_salary from play_orders')).rows[0].staff_salary,0);
 await db.exec("delete from play_orders;insert into salary_activity_commission_settings values('deepnight',98,'2026-10-01Z','2026-11-01Z')");
 assert.equal((await insert(db)).salary_rate,98);
 }finally{await db.close();}
});
test('empty order_id falls back to order_no for WORK dedupe, including parent correction metadata',async()=>{
 const db=await fixture();try{
 await insert(db,first,{staff_salary:0,wallet_settled_at:'2026-10-02Z',wallet_period_key:'2026-10-H1'});
 await insert(db,second,{order_id:'',order_no:`WORK-${first}-${staff}`,staff_salary:238,salary_rate:85,wallet_settled_at:'2026-10-02Z',wallet_period_key:'2026-10-H1'});
 assert.equal((await rpc(db)).orderCount,1);
 await db.query("insert into salary_wallet_entries(app_key,discord_id,entry_type,amount,source_table,source_id,metadata) values('deepnight','other','salary_correction',10,'other','other',$1)",[{target_order_id:first}]);
 await assert.rejects(()=>rpc(db),/原始訂單也有入帳/);
 }finally{await db.close();}
});
test('cutoff accepts explicit Taipei offset, rejects zero ledger source and pre-apply changes without writes',async()=>{
 const db=await fixture();try{
 await insert(db,first,{created_at:'2026-10-01T16:01:00',staff_salary:238,salary_rate:85,wallet_settled_at:'2026-10-02Z',wallet_period_key:'2026-10-H1'});
 const tooEarly=(await db.query('select repair_deepnight_commission_95($1,$2,$3) result',[staff,'2026-10-02T00:00:00+08:00',request])).rows[0].result;assert.equal(tooEarly.orderCount,0);
 const preview=await rpc(db);await db.query('update play_orders set staff_name=$1 where id=$2',['changed',first]);
 await assert.rejects(()=>rpc(db,true,preview.plan),/資料已變更/);assert.equal((await db.query('select count(*)::int n from salary_wallet_entries')).rows[0].n,0);
 await db.exec(`insert into salary_wallet_entries(app_key,discord_id,entry_type,amount,source_table,source_id) values('deepnight','${staff}','order_salary',0,'play_orders','${first}')`);
 await assert.rejects(()=>rpc(db),/已有修正/);
 }finally{await db.close();}
});
