import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateCourse,learnerSettings,audienceMatches,courseChapters} from '../lib/courseRules.mjs';
const actor='123456789012345678',manager='223456789012345678',other='323456789012345678';
const course=()=>({title:'訓練課程',category:'客服',isPublished:true,chapters:[{id:'one',title:'第一章',body:'請閱讀'},{id:'two',title:'第二章',body:'請確認'}],audience:{kind:'all_staff',ids:[]},requirements:{allChapters:true,minimumSeconds:15,approval:false,passScore:80},quiz:[{id:'q1',question:'正確答案',options:['是','否'],correct:0}]});
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table erp_role_assignments(organization_code text,discord_id text,is_active boolean,role text);create table admins(discord_id text,is_active boolean);create table qiunai_admins(discord_id text,is_active boolean);create table qiunai_staff(discord_id text,is_active boolean);create table players(discord_id text,is_active boolean);insert into qiunai_staff values('${actor}',true),('${manager}',true),('${other}',true);insert into players values('${actor}',true);insert into erp_role_assignments values('qiunai','${manager}',true,'store_manager');`);for(const file of ['20260929_eip_workspace.sql','20261103000300_knowledge_course_completions.sql','20261103000400_private_service_courses.sql','20261103000500_service_content_versions.sql','20261103000600_course_authoring.sql'])await db.exec((await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));return db;}
const save=async(db,data=course(),id=null,version=null)=>(await db.query('select save_managed_course($1,$2,$3,$4,$5) result',['qiunai',manager,id,version,validateCourse(data)])).rows[0].result;
const learn=async(db,c,action,input={},employee=actor)=>(await db.query('select course_learning_atomic($1,$2,$3,$4,$5,$6) result',['qiunai',c.id,employee,c.version,action,input])).rows[0].result;
async function satisfy(db,c,employee=actor){for(const chapter of ['one','two'])await learn(db,c,'read',{chapter},employee);await learn(db,c,'heartbeat',{},employee);await db.query('update course_learning_progress set last_seen=clock_timestamp()-interval \'16 seconds\' where discord_id=$1',[employee]);await learn(db,c,'heartbeat',{},employee);await learn(db,c,'quiz',{answers:{q1:0}},employee);}
test('course validation prevents malformed identities, duplicated chapters and invalid quizzes; learner DTO never includes correct answers',()=>{
 assert.equal(validateCourse(course()).chapters.length,2);
 for(const bad of [{chapters:[]},{chapters:[...course().chapters,course().chapters[0]]},{audience:{kind:'selected',ids:['bad']}},{audience:{kind:'selected',ids:{}}},{quiz:[{id:'a',question:'x',options:['1','2'],correct:9}]}])assert.throws(()=>validateCourse({...course(),...bad}));
 const dto=learnerSettings({...course(),managed:true});assert.equal(JSON.stringify(dto).includes('correct'),false);
 assert.equal(audienceMatches({kind:'selected',ids:[actor]},{discordId:other,active:true}),false);
 assert.equal(audienceMatches({kind:'all_staff'},{active:false}),false);
 assert.equal(audienceMatches({kind:'service'},{active:true,service:true}),true);
 assert.deepEqual(courseChapters({body:'## 課程\n內容'}).map(c=>c.id),['chapter-1']);
});
test('authoring keeps courses private, enforces store/manager/version, protects chapters against legacy editing',async()=>{const db=await fixture();try{
 const c=await save(db);assert.equal((await db.query('select is_published from eip_workspace_documents')).rows[0].is_published,false);
 await assert.rejects(()=>db.query('select save_managed_course($1,$2,$3,$4,$5)',['deepnight',manager,c.id,c.version,course()]),/管理課程/);
 await assert.rejects(()=>save(db,course(),c.id,c.version+1),/已被修改/);
 await assert.rejects(()=>db.exec("update eip_workspace_documents set body='legacy edit'"),/課程管理/);
 await assert.rejects(()=>db.exec('update eip_workspace_documents set is_published=true'),/客服課程只能/);
 const updated=await save(db,{...course(),title:'新版'},c.id,c.version);assert.equal(updated.version,c.version+1);
 assert.equal((await db.query('select count(*)::int n from eip_workspace_document_revisions')).rows[0].n,1);
}finally{await db.close();}});
test('database audience guard rejects unselected, manager-only and disabled staff; malformed conditions fail closed',async()=>{const db=await fixture();try{
 const data=course();data.audience={kind:'selected',ids:[actor]};const c=await save(db,data);
 await assert.rejects(()=>learn(db,c,'read',{chapter:'one'},other),/課程對象/);
 await assert.rejects(()=>db.exec("update service_course_links set requirements='{}'"),/check constraint/);
 await satisfy(db,c);await db.exec(`update qiunai_staff set is_active=false where discord_id='${actor}'`);await assert.rejects(()=>learn(db,c,'complete'),/課程對象/);
 await db.exec('update qiunai_staff set is_active=true');data.audience={kind:'managers',ids:[]};const m=await save(db,data,c.id,c.version);await assert.rejects(()=>learn(db,m,'heartbeat'),/課程對象/);
 data.audience={kind:'service',ids:[]};const s=await save(db,data,c.id,m.version);await assert.rejects(()=>learn(db,s,'heartbeat'),/課程對象/);
 await learn(db,s,'heartbeat',{serviceAuthorized:true});
 await assert.rejects(()=>learn(db,s,'complete',{serviceAuthorized:true}),/全部章節/);
}finally{await db.close();}});
test('no-op and publication changes preserve progress; substantive edits supersede pending reviews and attachments create versions',async()=>{const db=await fixture();try{
 const data=course();data.requirements.approval=true;const c=await save(db,data);await satisfy(db,c);await learn(db,c,'complete');
 assert.equal((await save(db,data,c.id,c.version)).version,c.version);
 assert.equal((await save(db,{...data,isPublished:false},c.id,c.version)).version,c.version);
 await assert.rejects(()=>learn(db,c,'heartbeat'),/未發布/);
 await save(db,data,c.id,c.version);assert.equal((await db.query('select review_status from course_learning_progress')).rows[0].review_status,'pending');
 const next=await save(db,{...data,title:'新課程'},c.id,c.version);assert.equal((await db.query('select review_status from course_learning_progress')).rows[0].review_status,'superseded');
 await assert.rejects(()=>learn(db,c,'approve',{employee:actor},manager),/已更新/);
 await db.exec('create schema storage;create table storage.objects(bucket_id text,name text)');
 const path=`qiunai/workspace/${c.id}/test-file`;
 const version=(await db.query('select change_course_attachment($1,$2,$3,$4,$5) v',['qiunai',manager,c.id,path,'hide'])).rows[0].v;
 assert.equal(version,next.version+1);assert.deepEqual((await db.query('select hidden_files from service_course_links')).rows[0].hidden_files,[path]);
 await db.query('select change_course_attachment($1,$2,$3,$4,$5)',['qiunai',manager,c.id,path,'restore']);assert.deepEqual((await db.query('select hidden_files from service_course_links')).rows[0].hidden_files,[]);
}finally{await db.close();}});
test('quiz cooldown and hourly limit reject repeated submissions; attachment limit rolls back version and hidden metadata',async()=>{const db=await fixture();try{
 const c=await save(db);await learn(db,c,'quiz',{answers:{q1:1}});await assert.rejects(()=>learn(db,c,'quiz',{answers:{q1:0}}),/30 秒/);
 await db.exec("update course_learning_progress set last_quiz_at=clock_timestamp()-interval '31 seconds',quiz_window_attempts=10");await assert.rejects(()=>learn(db,c,'quiz',{answers:{q1:0}}),/每小時/);
 await db.exec("update course_learning_progress set quiz_window_at=clock_timestamp()-interval '2 hours'");await learn(db,c,'quiz',{answers:{q1:0}});
 await db.exec('create schema storage;create table storage.objects(bucket_id text,name text)');
 const prefix=`qiunai/workspace/${c.id}/`;
 await db.query("insert into storage.objects select 'salary-admin-files',$1||n from generate_series(1,21) n",[prefix]);
 await assert.rejects(()=>db.query('select change_course_attachment($1,$2,$3,$4,$5)',['qiunai',manager,c.id,prefix+'21','add']),/20 個附件/);
 assert.equal((await db.query('select version from eip_workspace_documents')).rows[0].version,c.version);
 await db.query('select change_course_attachment($1,$2,$3,$4,$5)',['qiunai',manager,c.id,prefix+'21','hide']);
 await assert.rejects(()=>db.query('select change_course_attachment($1,$2,$3,$4,$5)',['qiunai',manager,c.id,prefix+'21','restore']),/20 個附件/);
 assert.deepEqual((await db.query('select hidden_files from service_course_links')).rows[0].hidden_files,[prefix+'21']);
}finally{await db.close();}});
test('server-clock study time, all chapters and quiz are required; old completion RPC cannot skip requirements',async()=>{const db=await fixture();try{
 const c=await save(db);
 for(const fn of ['complete_service_course_atomic','complete_knowledge_course_atomic'])await assert.rejects(()=>db.query(`select ${fn}($1,$2,$3,$4)`,['qiunai',c.id,actor,c.version]),/結訓條件|尚未發布/);
 await assert.rejects(()=>learn(db,c,'complete'),/全部章節/);
 await learn(db,c,'read',{chapter:'one'});await assert.rejects(()=>learn(db,c,'read',{chapter:'unknown'}),/章節不正確/);
 await learn(db,c,'read',{chapter:'two'});await assert.rejects(()=>learn(db,c,'complete'),/學習時間/);
 await learn(db,c,'heartbeat');await db.exec("update course_learning_progress set last_seen=clock_timestamp()-interval '2 hours'");await learn(db,c,'heartbeat');assert.equal((await db.query('select study_seconds from course_learning_progress')).rows[0].study_seconds,0);
 await satisfy(db,c);const completed=await learn(db,c,'complete');assert.ok(completed.completion.completed_at);const retry=await learn(db,c,'complete');assert.deepEqual(retry.completion,completed.completion);
 assert.equal((await db.query('select count(*)::int n from knowledge_course_completions')).rows[0].n,1);
 await assert.rejects(()=>learn(db,{...c,version:c.version+1},'complete'),/課程已更新/);
}finally{await db.close();}});
test('approval requires a different manager and current version; rejection is recoverable and never records completion',async()=>{const db=await fixture();try{
 const input=course();input.requirements.approval=true;const c=await save(db,input);await satisfy(db,c);
 assert.equal((await learn(db,c,'complete')).pendingApproval,true);assert.equal((await db.query('select count(*)::int n from knowledge_course_completions')).rows[0].n,0);
 await assert.rejects(()=>learn(db,c,'approve',{employee:actor},actor),/審核權限/);
 await assert.rejects(()=>learn(db,c,'approve',{employee:manager},manager),/自己的/);
 await learn(db,c,'reject',{employee:actor,note:'請確認'},manager);assert.equal((await db.query('select review_status from course_learning_progress where discord_id=$1',[actor])).rows[0].review_status,'rejected');
 await learn(db,c,'complete');const approved=await learn(db,c,'approve',{employee:actor,note:'通過'},manager);assert.ok(approved.completion);
 await assert.rejects(()=>learn(db,c,'approve',{employee:actor},manager),/已處理/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>learn(db,c,'complete'),/permission denied/);await assert.rejects(()=>db.exec('select * from course_learning_progress'),/permission denied/);await db.exec('reset role');}
}finally{await db.close();}});
