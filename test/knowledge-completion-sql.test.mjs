import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const staff="123456789012345678",other="223456789012345678",id="11111111-1111-4111-8111-111111111111";
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table qiunai_staff(discord_id text primary key,is_active boolean);
 create table players(discord_id text primary key,is_active boolean);
 create table eip_workspace_documents(id uuid primary key,organization_code text,document_type text,is_published boolean,version integer,title text);
 insert into qiunai_staff values('${staff}',true),('${other}',true);insert into players values('${staff}',true);
 insert into eip_workspace_documents values('${id}','qiunai','knowledge',true,2,'課程原始名稱');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261103000300_knowledge_course_completions.sql',import.meta.url),'utf8'));
 return db;
}
async function complete(db,employee=staff,version=2,organization='qiunai'){
 return(await db.query('select complete_knowledge_course_atomic($1,$2,$3,$4) result',[organization,id,employee,version])).rows[0].result;
}
test('completion is durable per employee and version; retries preserve the first timestamp',async()=>{
 const db=await fixture();try{
  const first=await complete(db);assert.equal(first.alreadyCompleted,false);assert.equal(first.completion.document_version,2);
  const retry=await complete(db);assert.equal(retry.alreadyCompleted,true);assert.deepEqual(retry.completion,first.completion);
  await complete(db,other);
  assert.equal((await db.query('select count(*)::int n from knowledge_course_completions')).rows[0].n,2);
  await db.exec("update eip_workspace_documents set version=3,title='新版課程'");
  await assert.rejects(()=>complete(db),/課程已更新/);
  const next=await complete(db,staff,3);assert.equal(next.alreadyCompleted,false);
  const snapshots=(await db.query('select course_title,document_version from knowledge_course_completions where discord_id=$1 order by document_version',[staff])).rows;
  assert.deepEqual(snapshots,[{course_title:'課程原始名稱',document_version:2},{course_title:'新版課程',document_version:3}]);
 }finally{await db.close();}
});
test('wrong department, disabled staff, removed courses, unpublished courses and documents cannot be completed',async()=>{
 const db=await fixture();try{
  await assert.rejects(()=>complete(db,staff,2,'deepnight'),/不存在/);
  await db.exec("update qiunai_staff set is_active=false where discord_id='"+staff+"'");
  await assert.rejects(()=>complete(db),/在職員工權限/);await db.exec('update qiunai_staff set is_active=true');
  await db.exec('update eip_workspace_documents set is_published=false');await assert.rejects(()=>complete(db),/不存在/);
  await db.exec("update eip_workspace_documents set is_published=true,document_type='document'");await assert.rejects(()=>complete(db),/不存在/);
  assert.equal((await db.query('select count(*)::int n from knowledge_course_completions')).rows[0].n,0);
 }finally{await db.close();}
});
test('anonymous and authenticated roles cannot forge completion; stored records are read-only to service_role',async()=>{
 const db=await fixture();try{
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(()=>complete(db),/permission denied/);
   await assert.rejects(()=>db.query('select * from knowledge_course_completions'),/permission denied/);await db.exec('reset role');
  }
  await db.exec('set role service_role');await complete(db);
  await assert.rejects(()=>db.exec('delete from knowledge_course_completions'),/permission denied/);
  assert.equal((await db.query('select count(*)::int n from knowledge_course_completions')).rows[0].n,1);
 }finally{await db.close();}
});
