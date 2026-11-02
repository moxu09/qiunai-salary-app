import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {discordChannel,manualHref,validateDesk,MANUAL_KINDS} from '../lib/serviceManual.mjs';
import {promisify} from 'node:util';
const owner='123456789012345678',other='223456789012345678',channel='323456789012345678';
const track={kind:'track',label:'驗證工單',body:'待回覆',priority:false,guildId:'1206138511535898654',channelId:channel};
async function database(){const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await db.exec(await promisify(readFile)(new URL('../supabase/migrations/20261103000700_service_manual_workspace.sql',import.meta.url),'utf8'));return db;}
const change=async(db,org,actor,id=null,version=null,action='save',data=track)=>(await db.query('select service_desk_change($1,$2,$3,$4,$5,$6) item',[org,actor,id,version,action,data])).rows[0].item;
test('links remain in the selected store and unsafe URLs are rejected before Discord lookup',()=>{
 assert.deepEqual(discordChannel(`https://discord.com/channels/1206138511535898654/${channel}/423456789012345678?jump=1`,'qiunai'),{guildId:'1206138511535898654',channelId:channel,url:`https://discord.com/channels/1206138511535898654/${channel}`});
 assert.deepEqual(discordChannel(channel,'qiunai'),{guildId:null,channelId:channel,url:null});
 for(const url of [`https://discord.com.evil.example/channels/1206138511535898654/${channel}`,`https://discord.com/channels/@me/${channel}`,`https://discord.com/channels/1501098191813214312/${channel}`])assert.throws(()=>discordChannel(url,'qiunai'));
 assert.equal(manualHref('flow','order','deepnight'),'/service/flows/order?department=deepnight');
 assert.equal(validateDesk({kind:'broadcast',label:'播報',body:'甲'.repeat(3000),priority:false}).body.length,3000);
 assert.throws(()=>validateDesk({kind:'note',label:'備註',body:'甲'.repeat(2001),priority:false}));
});
test('tracking is private to its actor and store; duplicate prevention, archive, restore and stale edits are enforced in SQL',async()=>{const db=await database();try{
 const item=await change(db,'qiunai',owner);assert.equal(item.owner_discord_id,owner);assert.equal(item.version,1);
 await assert.rejects(()=>change(db,'qiunai',other,item.id,1,'archive',{}),/找不到/);
 await assert.rejects(()=>change(db,'deepnight',owner,item.id,1,'archive',{}),/找不到/);
 await assert.rejects(()=>change(db,'qiunai',owner),/duplicate key/);
 await assert.rejects(()=>change(db,'deepnight',owner),/check constraint/);
 const archived=await change(db,'qiunai',owner,item.id,1,'archive',{});assert.ok(archived.archived_at);
 await assert.rejects(()=>change(db,'qiunai',owner,item.id,1,'restore',{}),/已由其他人/);
 const restored=await change(db,'qiunai',owner,item.id,2,'restore',{});assert.equal(restored.archived_at,null);
 assert.equal((await db.query('select count(*)::int n from service_desk_audit')).rows[0].n,3);
}finally{await db.close();}});
test('notes and broadcasts are shared only within their store; browser roles cannot read or mutate any desk tables',async()=>{const db=await database();try{
 for(const kind of ['note','broadcast']){
  const data={kind,label:'驗證',body:'合成測試',priority:true};const item=await change(db,'deepnight',owner,null,null,'save',data);
  const edited=await change(db,'deepnight',other,item.id,1,'save',{...data,body:'交接完成'});assert.equal(edited.updated_by,other);assert.equal(edited.owner_discord_id,owner);
  await assert.rejects(()=>change(db,'qiunai',other,item.id,2,'save',data),/找不到/);
 }
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['service_manual_entries','service_desk_records','service_desk_audit'])await assert.rejects(()=>db.query('select * from '+table),/permission denied/);await assert.rejects(()=>change(db,'qiunai',owner),/permission denied/);await db.exec('reset role');}
}finally{await db.close();}});
test('manual item versions change only for meaningful content edits and content is searchable',async()=>{const db=await database();try{
 const id=(await db.query("insert into service_manual_entries(organization_code,kind,slug,title,content) values('qiunai','flow','sample','驗證','{\"stages\":[\"異常處理\"]}') returning id")).rows[0].id;
 await db.query('update service_manual_entries set sort_order=9 where id=$1',[id]);assert.equal((await db.query('select version from service_manual_entries')).rows[0].version,1);
 await db.query("update service_manual_entries set summary='查詢作業' where id=$1",[id]);const result=(await db.query("select version from service_manual_entries where search_text ilike '%異常處理%' and search_text ilike '%查詢作業%'")).rows[0];assert.equal(result.version,2);
 await assert.rejects(()=>db.exec("update service_manual_entries set storage_path='deepnight/manual/foreign.webp'"),/check constraint/);
}finally{await db.close();}});
test('manual API authorizes before queries and never signs paths belonging to another store',async()=>{
 const source=readFileSync(new URL('../app/service/api/manual/route.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replaceAll('export ','');let allowed=false;const calls=[];
 const context={Response,Request,URL,Date,MANUAL_KINDS,ADMIN_FILE_BUCKET:'salary-admin-files',manualActor:async()=>{if(!allowed)throw Object.assign(Error('deny'),{status:403});},deskError:error=>Response.json({ok:false},{status:error.status||503}),supabaseAdmin:{from(table){calls.push(table);return {select(){return this;},eq(){return this;},or(){return this;},order(){return this;},limit:async()=>({data:[{slug:'right',storage_path:'qiunai/manual/x.webp'},{slug:'wrong',storage_path:'deepnight/manual/y.webp'}]})};},storage:{from(){return {createSignedUrls:async paths=>{calls.push(...paths);return {data:paths.map(path=>({path,signedUrl:'https://test.invalid/short-lived'}))};}};}}}};
 runInNewContext(source+'\nthis.get=GET;',context);const request=new Request('http://local/service/api/manual?department=qiunai&kind=price');assert.equal((await context.get(request)).status,403);assert.deepEqual(calls,[]);allowed=true;const result=await(await context.get(request)).json();assert.deepEqual(calls,['service_manual_entries','qiunai/manual/x.webp']);assert.equal(result.items[1].imageUrl,null);assert.ok(result.items.every(item=>!('storage_path' in item)));
});
