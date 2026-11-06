import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id='11111111-1111-4111-8111-111111111111', actor='123456789012345678';
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table erp_role_assignments(organization_code text,discord_id text,is_active boolean,role text);create table admins(discord_id text,is_active boolean);create table qiunai_admins(discord_id text,is_active boolean);create table qiunai_staff(discord_id text,is_active boolean);create table players(discord_id text,is_active boolean);create table eip_workspace_documents(id uuid primary key,organization_code text,document_type text,is_published boolean,version integer,title text);insert into qiunai_staff values('${actor}',true);insert into eip_workspace_documents values('${id}','qiunai','knowledge',true,1,'客服內訓');`);for(const file of ['20261103000300_knowledge_course_completions.sql','20261103000400_private_service_courses.sql','20261103000500_service_content_versions.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));return db;}
test('private course mapping hides legacy document and rejects accidental public publishing or moving stores',async()=>{const db=await fixture();try{
 await db.exec(`insert into service_course_links values('${id}','qiunai','support-training',true)`);
 assert.equal((await db.query('select is_published from eip_workspace_documents')).rows[0].is_published,false);
 for(const change of ["is_published=true","organization_code='deepnight'","document_type='document'"])await assert.rejects(()=>db.exec('update eip_workspace_documents set '+change),/客服課程只能/);
 await assert.rejects(()=>db.exec("update service_course_links set organization_code='deepnight'"),/所屬店家/);
 const completion=(await db.query('select complete_service_course_atomic($1,$2,$3,$4) result',['qiunai',id,actor,1])).rows[0].result;
 assert.equal(completion.alreadyCompleted,false);
 await assert.rejects(()=>db.query('select complete_knowledge_course_atomic($1,$2,$3,$4)',['qiunai',id,actor,1]),/尚未發布/);
 await db.exec('update service_course_links set is_published=false');
 await assert.rejects(()=>db.query('select complete_service_course_atomic($1,$2,$3,$4)',['qiunai',id,actor,1]),/尚未發布/);
}finally{await db.close();}});
test('new private catalogs and panel registry are unavailable to anonymous and ordinary authenticated clients',async()=>{const db=await fixture();try{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['service_course_links','service_templates','service_guides','service_panel_registry'])await assert.rejects(()=>db.query('select * from '+table),/permission denied/);await assert.rejects(()=>db.query("select lease_service_panel('qiunai','22222222-2222-4222-8222-222222222222')"),/permission denied/);await db.exec('reset role');}
 const lease=(owner)=>db.query('select lease_service_panel($1,$2) result',['qiunai',owner]);
 assert.ok((await lease('22222222-2222-4222-8222-222222222222')).rows[0].result);
 assert.equal((await lease('33333333-3333-4333-8333-333333333333')).rows[0].result,null);
 await db.exec("update service_panel_registry set lease_until=now()-interval '1 second'");
 assert.ok((await lease('33333333-3333-4333-8333-333333333333')).rows[0].result);
 await assert.rejects(()=>db.exec("update service_panel_registry set channel_id='999999999999999999' where organization_code='qiunai'"),/check constraint/);
}finally{await db.close();}});
