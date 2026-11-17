import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateCourse,learnerSettings,audienceMatches,courseChapters} from '../lib/courseRules.mjs';
const actor='123456789012345678',manager='223456789012345678',other='323456789012345678';
const course=()=>({title:'訓練課程',category:'客服',isPublished:true,chapters:[{id:'one',title:'第一章',body:'請閱讀'},{id:'two',title:'第二章',body:'請確認'}],audience:{kind:'all_staff',ids:[]},requirements:{allChapters:true,minimumSeconds:15,approval:false,passScore:80},quiz:[{id:'q1',question:'正確答案',options:['是','否'],correct:0}]});
async function applyAutomaticCompletion(db) {
  await db.exec(await readFile(new URL('../supabase/migrations/20261118010000_hr_automatic_course_completion.sql', import.meta.url), 'utf8'));
}
async function fixture(automatic = true){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table erp_role_assignments(organization_code text,discord_id text,is_active boolean,role text);create table admins(discord_id text,is_active boolean);create table qiunai_admins(discord_id text,is_active boolean);create table qiunai_staff(discord_id text,is_active boolean,created_at timestamptz default now());create table employment_contract_signings(discord_id text,status text,signed_at timestamptz);create table players(discord_id text,is_active boolean);insert into qiunai_staff values('${actor}',true),('${manager}',true),('${other}',true);insert into players values('${actor}',true);insert into erp_role_assignments values('qiunai','${manager}',true,'store_manager');`);for(const file of ['20260929_eip_workspace.sql','20260929_eip_workflow_two_stage.sql','20261103000300_knowledge_course_completions.sql','20261103000400_private_service_courses.sql','20261103000500_service_content_versions.sql','20261103000600_course_authoring.sql','20261106000100_hr_workspace_management.sql'])await db.exec((await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
await db.exec(`create function qiunai_guard_new_hire_learning() returns trigger language plpgsql as $$
begin
 if tg_table_name='knowledge_course_completions'
   and new.document_id='28df42e9-99d0-41aa-86f5-c26f99cf77ce'
   and not exists (select 1 from service_course_links where document_id=new.document_id
     and requirements->>'allChapters'='true') then raise exception '舊逐章確認規則'; end if;
 return new;
end $$;
create trigger qiunai_guard_new_hire_learning before insert or update on course_learning_progress
 for each row execute function qiunai_guard_new_hire_learning();
create trigger qiunai_guard_new_hire_completion before insert on knowledge_course_completions
 for each row execute function qiunai_guard_new_hire_learning();`);
if (automatic) await applyAutomaticCompletion(db);return db;}
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
 await assert.rejects(()=>learn(db,s,'complete',{serviceAuthorized:true}),/學習時間/);
}finally{await db.close();}});
test('publication changes preserve progress; substantive edits and attachments create versions',async()=>{const db=await fixture();try{
 const data=course();const c=await save(db,data);await satisfy(db,c);
 assert.equal((await save(db,data,c.id,c.version)).version,c.version);
 assert.equal((await save(db,{...data,isPublished:false},c.id,c.version)).version,c.version);
 await assert.rejects(()=>learn(db,c,'heartbeat'),/未發布/);
 await save(db,data,c.id,c.version);
 assert.ok((await learn(db,c,'heartbeat')).completion);
 const next=await save(db,{...data,title:'新課程'},c.id,c.version);
 await assert.rejects(()=>learn(db,c,'heartbeat'),/已更新/);
 assert.equal((await learn(db,next,'heartbeat')).completion,null);
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
test('the second threshold completes automatically in either order; older clients cannot bypass it', async () => {
 const db = await fixture();
 try {
  const c = await save(db);
  for (const fn of ['complete_service_course_atomic', 'complete_knowledge_course_atomic']) {
   await assert.rejects(() => db.query(`select ${fn}($1,$2,$3,$4)`, ['qiunai',c.id,actor,c.version]), /結訓條件|尚未發布/);
  }
  assert.equal((await learn(db,c,'quiz',{answers:{q1:0}})).completion, null);
  await assert.rejects(() => learn(db,c,'complete'), /學習時間/);
  await learn(db,c,'heartbeat');
  await db.query("update course_learning_progress set last_seen=clock_timestamp()-interval '2 hours' where discord_id=$1", [actor]);
  assert.equal((await learn(db,c,'heartbeat')).progress.study_seconds, 0);
  await db.query("update course_learning_progress set last_seen=clock_timestamp()-interval '15 seconds' where discord_id=$1", [actor]);
  const byTime = await learn(db,c,'heartbeat');
  assert.ok(byTime.completion.completed_at);
  assert.deepEqual(byTime.progress.read_chapters, []);
  assert.deepEqual((await learn(db,c,'complete')).completion, byTime.completion);

  await learn(db,c,'heartbeat',{},other);
  await db.query("update course_learning_progress set last_seen=clock_timestamp()-interval '15 seconds' where discord_id=$1", [other]);
  assert.equal((await learn(db,c,'heartbeat',{},other)).completion, null);
  await assert.rejects(() => learn(db,c,'complete',{},other), /及格分數/);
  const byScore = await learn(db,c,'quiz',{answers:{q1:0}},other);
  assert.ok(byScore.completion.completed_at);
  assert.equal((await db.query('select count(*)::int n from knowledge_course_completions')).rows[0].n, 2);
  for (const role of ['anon','authenticated']) {
   await db.exec('set role '+role);
   await assert.rejects(() => learn(db,c,'complete'), /permission denied/);
   await assert.rejects(() => db.exec('select * from course_learning_progress'), /permission denied/);
   await db.exec('reset role');
  }
 } finally { await db.close(); }
});

test('the migration backfills eligible current versions and preserves accumulated progress', async () => {
 const db = await fixture(false);
 try {
  const c = await save(db);
  await db.exec(`update service_course_links set requirements=requirements || '{"approval":true,"allChapters":true}'`);
  await db.query(`insert into course_learning_progress
    (organization_code,document_id,discord_id,document_version,study_seconds,quiz_score)
    values ('qiunai',$1,$2,$3,15,80), ('qiunai',$1,$4,$3,14,100), ('qiunai',$1,$5,$3,15,100),
      ('qiunai',$1,$2,$3+1,100,100)`, [c.id,actor,c.version,other,manager]);
  await db.query("update qiunai_staff set is_active=false where discord_id=$1", [manager]);
  const rows = () => db.query("select discord_id, document_version from knowledge_course_completions order by discord_id");
  await applyAutomaticCompletion(db);
  assert.deepEqual((await rows()).rows,[{discord_id:actor,document_version:c.version}]);
  assert.equal((await db.query("select version from eip_workspace_documents where id=$1",[c.id])).rows[0].version,c.version);
  await applyAutomaticCompletion(db);
  assert.equal((await rows()).rows.length,1);
  await assert.rejects(() => learn(db,c,'approve',{employee:other},manager), /學習資料不正確/);
 } finally { await db.close(); }
});

test('autocompletion respects the separate Qiunai contract gate and backfills signed employees', async () => {
 const db = await fixture(false);
 const id = '28df42e9-99d0-41aa-86f5-c26f99cf77ce';
 try {
  await db.query(`insert into eip_workspace_documents
    (id,organization_code,document_type,title,category,body,is_published,created_by)
    values ($1,'qiunai','knowledge','新人訓練','教育訓練','內容',false,$2)`, [id,manager]);
  await db.query(`insert into service_course_links
    (document_id,organization_code,slug,is_published,managed,audience,chapters,requirements,quiz)
    values ($1,'qiunai','training',true,true,$2,$3,$4,$5)`,
    [id,course().audience,JSON.stringify(course().chapters),course().requirements,JSON.stringify(course().quiz)]);
  await db.query(`insert into course_learning_progress
    (organization_code,document_id,discord_id,document_version,study_seconds,quiz_score)
    values ('qiunai',$1,$2,1,15,80), ('qiunai',$1,$3,1,15,80)`, [id,actor,other]);
  await db.query("insert into employment_contract_signings values ($1,'signed',now())", [actor]);
  await applyAutomaticCompletion(db);
  const courseRef = {id,version:1};
  assert.ok((await learn(db,courseRef,'heartbeat')).completion);
  await assert.rejects(() => learn(db,courseRef,'heartbeat',{},other), /請先完成入職契約/);
  const result = await db.query('select discord_id from knowledge_course_completions');
  assert.deepEqual(result.rows,[{discord_id:actor}]);
 } finally { await db.close(); }
});

test("course archive is department-scoped, checks manager and version, and prevents republishing", async () => {
 const db = await fixture();
 try {
  const c = await save(db);
  const archive = async (person, version) => (await db.query(
    "select archive_hr_course('qiunai', $1, $2, $3) as archived", [person, c.id, version],
  )).rows[0].archived;
  await assert.rejects(() => archive(actor, c.version), /沒有管理課程/);
  assert.equal(await archive(manager, c.version + 1), false);
  assert.equal(await archive(manager, c.version), true);
  assert.equal(await archive(manager, c.version), false);
  const saved = (await db.query("select version, archived_at from eip_workspace_documents")).rows[0];
  assert.equal(saved.version, c.version + 1);
  assert.ok(saved.archived_at);
  await assert.rejects(() => save(db, course(), c.id, saved.version), /課程已移除/);
  await assert.rejects(() => learn(db, c, "heartbeat"), /未發布/);
 } finally { await db.close(); }
});
