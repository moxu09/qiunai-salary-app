begin;
alter table public.service_course_links
 add column managed boolean not null default false,
 add column audience jsonb not null default '{"kind":"service","ids":[]}',
 add column chapters jsonb not null default '[]',
 add column requirements jsonb not null default '{"allChapters":false,"minimumSeconds":0,"approval":false,"passScore":80}',
 add column quiz jsonb not null default '[]',
 add column hidden_files text[] not null default '{}';
alter table public.service_course_links add constraint course_settings_shape check (
 jsonb_typeof(chapters)='array' and jsonb_array_length(chapters)<=100 and
 jsonb_typeof(quiz)='array' and jsonb_array_length(quiz)<=30 and
 (audience->>'kind' in ('all_staff','service','managers','selected')) is true and jsonb_typeof(audience->'ids') is not distinct from 'array' and
 jsonb_typeof(requirements->'allChapters') is not distinct from 'boolean' and jsonb_typeof(requirements->'approval') is not distinct from 'boolean' and
 jsonb_typeof(requirements->'minimumSeconds') is not distinct from 'number' and (requirements->>'minimumSeconds') ~ '^[0-9]+$' and (requirements->>'minimumSeconds')::numeric between 0 and 86400 and
 jsonb_typeof(requirements->'passScore') is not distinct from 'number' and (requirements->>'passScore') ~ '^[0-9]+$' and (requirements->>'passScore')::numeric between 1 and 100);

create table public.course_learning_progress (
 organization_code text not null check(organization_code in ('qiunai','deepnight')),
 document_id uuid not null, discord_id text not null check(discord_id ~ '^[0-9]{15,22}$'),
 document_version integer not null check(document_version>0),
 read_chapters text[] not null default '{}', study_seconds integer not null default 0 check(study_seconds>=0),
 last_seen timestamptz, quiz_score integer check(quiz_score between 0 and 100), quiz_attempts integer not null default 0,last_quiz_at timestamptz,quiz_window_at timestamptz,quiz_window_attempts integer not null default 0,
 review_status text not null default 'not_submitted' check(review_status in ('not_submitted','pending','approved','rejected','superseded')),
 reviewed_by text,review_note text,reviewed_at timestamptz,updated_at timestamptz not null default now(),
 primary key(organization_code,document_id,discord_id,document_version)
);
alter table public.course_learning_progress enable row level security;
revoke all on public.course_learning_progress from public,anon,authenticated,service_role;
grant select on public.course_learning_progress to service_role;

create function public.course_is_manager(p_org text,p_actor text) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.erp_role_assignments where organization_code=p_org and discord_id=p_actor and is_active=false)
 and not ((p_org='qiunai' and exists(select 1 from public.qiunai_staff where discord_id=p_actor and is_active=false)) or (p_org='deepnight' and exists(select 1 from public.players where discord_id=p_actor and is_active=false)))
 and (p_actor='847840193859682304' or exists(select 1 from public.erp_role_assignments where organization_code=p_org and discord_id=p_actor and is_active is distinct from false and role in ('super_admin','store_manager'))
 or (not exists(select 1 from public.erp_role_assignments where organization_code=p_org and discord_id=p_actor) and
 ((p_org='qiunai' and exists(select 1 from public.qiunai_admins where discord_id=p_actor and is_active)) or
 (p_org='deepnight' and exists(select 1 from public.admins where discord_id=p_actor and is_active)))));
$$;
create function public.course_can_learn(p_org text,p_id uuid,p_actor text,p_service_verified boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a jsonb;
begin
 if public.course_is_manager(p_org,p_actor) then return true;end if;
 if exists(select 1 from public.erp_role_assignments where organization_code=p_org and discord_id=p_actor and is_active=false) or not ((p_org='qiunai' and exists(select 1 from public.qiunai_staff where discord_id=p_actor and is_active is distinct from false)) or (p_org='deepnight' and exists(select 1 from public.players where discord_id=p_actor and is_active is distinct from false))) then return false;end if;
 select audience into a from public.service_course_links where document_id=p_id and organization_code=p_org;
 return case a->>'kind' when 'all_staff' then true when 'selected' then (a->'ids') ? p_actor when 'managers' then false when 'service' then
  p_service_verified or exists(select 1 from public.erp_role_assignments where organization_code=p_org and discord_id=p_actor and is_active is distinct from false and role='customer_service') else false end;
end $$;
create function public.save_managed_course(p_org text,p_actor text,p_id uuid,p_version integer,p_course jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.eip_workspace_documents%rowtype; prior public.service_course_links%rowtype; course_id uuid; content text;changed boolean:=true;
begin
 if p_org is null or p_org not in ('qiunai','deepnight') or p_actor is null or not public.course_is_manager(p_org,p_actor) then raise exception using errcode='42501',message='沒有管理課程的權限'; end if;
 if jsonb_typeof(p_course->'chapters') is distinct from 'array' or jsonb_array_length(p_course->'chapters') not between 1 and 100 or length(p_course->>'title') not between 1 and 120 then raise exception using errcode='22023',message='課程資料不正確'; end if;
 select string_agg('## '||(chapter->>'title')||E'\n\n'||(chapter->>'body'),E'\n\n' order by n) into content from jsonb_array_elements(p_course->'chapters') with ordinality as c(chapter,n);
 if p_id is null then
  insert into public.eip_workspace_documents(organization_code,document_type,title,category,body,is_published,created_by)
  values(p_org,'knowledge',p_course->>'title',p_course->>'category',content,false,p_actor) returning id into course_id;
 else
  select * into d from public.eip_workspace_documents where id=p_id and organization_code=p_org and document_type='knowledge' for update;
  if not found then raise exception using errcode='P0002',message='找不到課程'; end if;
  if p_version is null or d.version<>p_version then raise exception using errcode='40001',message='課程已被修改，請重新載入'; end if;
  select * into prior from public.service_course_links where document_id=p_id;
  if not found then raise exception using errcode='22023',message='一般知識文章請另建新課程，原文章會保留';end if;
  changed:=not prior.managed or (d.title,d.category,d.body,prior.chapters,prior.audience,prior.requirements,prior.quiz) is distinct from (p_course->>'title',p_course->>'category',content,p_course->'chapters',p_course->'audience',p_course->'requirements',p_course->'quiz');
  if changed then
   perform set_config('app.course_authoring','on',true);
   update public.eip_workspace_documents set title=p_course->>'title',category=p_course->>'category',body=content,is_published=false where id=p_id;
   perform set_config('app.course_authoring','off',true);
   update public.course_learning_progress set review_status='superseded',review_note='課程已更新，請閱讀新版並重新申請結訓' where document_id=p_id and review_status='pending';
  end if;
  course_id:=p_id;
 end if;
 insert into public.service_course_links(document_id,organization_code,slug,is_published,managed,audience,chapters,requirements,quiz)
 values(course_id,p_org,'course-'||course_id::text,(p_course->>'isPublished')::boolean,true,p_course->'audience',p_course->'chapters',p_course->'requirements',p_course->'quiz')
 on conflict(document_id) do update set is_published=excluded.is_published,managed=true,audience=excluded.audience,chapters=excluded.chapters,requirements=excluded.requirements,quiz=excluded.quiz;
 select * into d from public.eip_workspace_documents where id=course_id;
 return jsonb_build_object('id',d.id,'version',d.version);
end $$;

create function public.guard_managed_document() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.body,new.title,new.category) is distinct from (old.body,old.title,old.category)
 and exists(select 1 from public.service_course_links where document_id=old.id and managed)
 and current_setting('app.course_authoring',true) is distinct from 'on' then
  raise exception using errcode='42501',message='請到課程管理編輯章節與內容';
 end if;
 return new;
end $$;
create trigger managed_document_guard before update on public.eip_workspace_documents for each row execute function public.guard_managed_document();

create function public.change_course_attachment(p_org text,p_actor text,p_id uuid,p_path text,p_action text) returns integer
language plpgsql security definer set search_path='' as $$
declare d public.eip_workspace_documents%rowtype;v integer;hidden text[];
begin
 if not public.course_is_manager(p_org,p_actor) then raise exception using errcode='42501',message='沒有管理附件權限';end if;
 select * into d from public.eip_workspace_documents where id=p_id and organization_code=p_org and document_type='knowledge' for update;
 if not found or p_path is null or left(p_path,length(p_org||'/workspace/'||p_id::text||'/'))<>p_org||'/workspace/'||p_id::text||'/' or p_action not in ('add','hide','restore') then raise exception using errcode='22023',message='附件資料不正確';end if;
 if p_action='hide' then update public.service_course_links set hidden_files=array(select distinct x from unnest(hidden_files||array[p_path]) x) where document_id=p_id;
 elsif p_action='restore' then update public.service_course_links set hidden_files=array_remove(hidden_files,p_path) where document_id=p_id;end if;
 select hidden_files into hidden from public.service_course_links where document_id=p_id;
 if not found then raise exception using errcode='22023',message='請先儲存課程';end if;
 if (select count(*) from storage.objects where bucket_id='salary-admin-files' and name like p_org||'/workspace/'||p_id::text||'/%' and not(name=any(hidden)))>20 then raise exception using errcode='22023',message='每門課程最多 20 個附件';end if;
 update public.eip_workspace_documents set updated_at=now() where id=p_id returning version into v;
 update public.course_learning_progress set review_status='superseded',review_note='課程附件已更新，請閱讀新版並重新申請結訓' where document_id=p_id and review_status='pending';
 return v;
end $$;

-- A persisted guard also covers both older completion functions. Neither an old
-- browser nor a direct service RPC call may skip managed course requirements.
create function public.enforce_managed_completion() returns trigger
language plpgsql security definer set search_path='' as $$
declare l public.service_course_links%rowtype;p public.course_learning_progress%rowtype;v integer;
begin
 select version into v from public.eip_workspace_documents where id=new.document_id for share;
 select * into l from public.service_course_links where document_id=new.document_id and organization_code=new.organization_code;
 if not found or not l.managed then return new; end if;
 if public.course_can_learn(new.organization_code,new.document_id,new.discord_id,current_setting('app.course_service_learner',true)=new.organization_code||':'||new.document_id::text||':'||new.discord_id) is not true then raise exception using errcode='42501',message='不在課程對象內';end if;
 if not l.is_published or v<>new.document_version then raise exception using errcode='40001',message='課程已更新或已下架'; end if;
 select * into p from public.course_learning_progress where organization_code=new.organization_code and document_id=new.document_id and discord_id=new.discord_id and document_version=new.document_version for update;
 if not found then raise exception using errcode='22023',message='尚未達成結訓條件'; end if;
 if (l.requirements->>'allChapters')::boolean and exists(select 1 from jsonb_array_elements(l.chapters) c where not (c->>'id'=any(p.read_chapters))) then raise exception using errcode='22023',message='請先確認讀完全部章節'; end if;
 if p.study_seconds<(l.requirements->>'minimumSeconds')::integer then raise exception using errcode='22023',message='尚未達到最低學習時間'; end if;
 if jsonb_array_length(l.quiz)>0 and coalesce(p.quiz_score,-1)<(l.requirements->>'passScore')::integer then raise exception using errcode='22023',message='測驗尚未達到及格分數'; end if;
 if (l.requirements->>'approval')::boolean and p.review_status<>'approved' then raise exception using errcode='22023',message='尚待主管審核結訓'; end if;
 return new;
end $$;
create trigger managed_completion_guard before insert on public.knowledge_course_completions for each row execute function public.enforce_managed_completion();

create function public.course_learning_atomic(p_org text,p_id uuid,p_actor text,p_version integer,p_action text,p_input jsonb default '{}',p_source text default 'hr') returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.eip_workspace_documents%rowtype;l public.service_course_links%rowtype;p public.course_learning_progress%rowtype;
 target text; elapsed integer; question jsonb; answer integer; correct integer:=0; score integer; result jsonb; chapter text;
begin
 if p_org is null or p_org not in ('qiunai','deepnight') or p_actor is null or p_actor!~'^[0-9]{15,22}$' or p_version is null or p_source is null or p_action is null or p_source not in ('hr','service-web','discord') or p_action not in ('heartbeat','read','quiz','complete','approve','reject') then raise exception using errcode='22023',message='學習資料不正確'; end if;
 -- Document is locked before the link in all mutation paths.
 if p_action in ('heartbeat','read','quiz') then
  select * into d from public.eip_workspace_documents where id=p_id and organization_code=p_org and document_type='knowledge' for share;
 else
  select * into d from public.eip_workspace_documents where id=p_id and organization_code=p_org and document_type='knowledge' for update;
 end if;
 if not found then raise exception using errcode='P0002',message='找不到課程'; end if;
 select * into l from public.service_course_links where document_id=p_id and organization_code=p_org;
 if not found or not l.is_published or not l.managed then raise exception using errcode='P0002',message='課程未發布'; end if;
 if d.version<>p_version then raise exception using errcode='40001',message='課程已更新，請重新載入'; end if;
 target:=p_actor;
 if p_action in ('approve','reject') then
  if not public.course_is_manager(p_org,p_actor) then raise exception using errcode='42501',message='沒有審核權限'; end if;
  target:=p_input->>'employee';
  if target is null or target!~'^[0-9]{15,22}$' or target=p_actor then raise exception using errcode='42501',message='不得審核自己的結訓申請'; end if;
 end if;
 if p_action<>'reject' and public.course_can_learn(p_org,p_id,target,coalesce((p_input->>'serviceAuthorized')::boolean,false)) is not true then raise exception using errcode='42501',message='不在課程對象內';end if;
 perform set_config('app.course_service_learner',case when coalesce((p_input->>'serviceAuthorized')::boolean,false) then p_org||':'||p_id::text||':'||target else '' end,true);
 if p_action<>'reject' and not public.course_is_manager(p_org,target) and not ((p_org='qiunai' and exists(select 1 from public.qiunai_staff where discord_id=target and is_active is distinct from false)) or (p_org='deepnight' and exists(select 1 from public.players where discord_id=target and is_active is distinct from false))) then raise exception using errcode='42501',message='沒有在職員工權限'; end if;
 insert into public.course_learning_progress(organization_code,document_id,discord_id,document_version) values(p_org,p_id,target,p_version) on conflict do nothing;
 select * into p from public.course_learning_progress where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version for update;
 if p_action='heartbeat' then
  elapsed:=coalesce(floor(extract(epoch from clock_timestamp()-p.last_seen))::integer,0);
  update public.course_learning_progress set study_seconds=study_seconds+case when elapsed between 1 and 45 then elapsed else 0 end,last_seen=clock_timestamp() where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version;
 elsif p_action='read' then
  chapter:=p_input->>'chapter';
  if chapter is null or not exists(select 1 from jsonb_array_elements(l.chapters) c where c->>'id'=chapter) then raise exception using errcode='22023',message='章節不正確'; end if;
  update public.course_learning_progress set read_chapters=array(select distinct x from unnest(read_chapters||array[chapter]) x) where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version;
 elsif p_action='quiz' then
  if p.last_quiz_at>clock_timestamp()-interval '30 seconds' or (p.quiz_window_at>clock_timestamp()-interval '1 hour' and p.quiz_window_attempts>=10) then raise exception using errcode='22023',message='測驗每 30 秒可提交一次，每小時最多 10 次';end if;
  if jsonb_array_length(l.quiz)=0 or jsonb_typeof(p_input->'answers') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input->'answers'))<>jsonb_array_length(l.quiz) then raise exception using errcode='22023',message='請回答全部測驗題目'; end if;
  for question in select * from jsonb_array_elements(l.quiz) loop
   if jsonb_typeof(p_input->'answers'->(question->>'id')) is distinct from 'number' or (p_input->'answers'->>(question->>'id'))!~'^[0-9]$' then raise exception using errcode='22023',message='測驗答案不正確'; end if;
   answer:=(p_input->'answers'->>(question->>'id'))::integer;
   if answer>=jsonb_array_length(question->'options') then raise exception using errcode='22023',message='測驗答案不正確'; end if;
   if answer=(question->>'correct')::integer then correct:=correct+1; end if;
  end loop;
  score:=floor(100.0*correct/jsonb_array_length(l.quiz));
  update public.course_learning_progress set quiz_score=greatest(coalesce(quiz_score,0),score),quiz_attempts=quiz_attempts+1,last_quiz_at=clock_timestamp(),quiz_window_at=case when quiz_window_at>clock_timestamp()-interval '1 hour' then quiz_window_at else clock_timestamp() end,quiz_window_attempts=case when quiz_window_at>clock_timestamp()-interval '1 hour' then quiz_window_attempts+1 else 1 end where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version;
 elsif p_action in ('complete','approve') then
  if p_action='approve' then
   if p.review_status<>'pending' then raise exception using errcode='40001',message='申請已處理或尚未送出'; end if;
   update public.course_learning_progress set review_status='approved',reviewed_by=p_actor,reviewed_at=clock_timestamp(),review_note=left(coalesce(p_input->>'note',''),1000) where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version;
  elsif (l.requirements->>'approval')::boolean and p.review_status<>'approved' then
   -- Validate every other requirement before accepting a review request.
   if (l.requirements->>'allChapters')::boolean and exists(select 1 from jsonb_array_elements(l.chapters) c where not(c->>'id'=any(p.read_chapters))) then raise exception using errcode='22023',message='請先確認讀完全部章節'; end if;
   if p.study_seconds<(l.requirements->>'minimumSeconds')::integer then raise exception using errcode='22023',message='尚未達到最低學習時間'; end if;
   if jsonb_array_length(l.quiz)>0 and coalesce(p.quiz_score,-1)<(l.requirements->>'passScore')::integer then raise exception using errcode='22023',message='測驗尚未達到及格分數'; end if;
   update public.course_learning_progress set review_status='pending',reviewed_by=null,review_note=null,reviewed_at=null where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version;
   return jsonb_build_object('pendingApproval',true,'progress',(select to_jsonb(x) from public.course_learning_progress x where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version));
  end if;
  insert into public.knowledge_course_completions(organization_code,document_id,discord_id,document_version,course_title,source)
   values(p_org,p_id,target,p_version,d.title,p_source) on conflict do nothing;
 elsif p_action='reject' then
  if p.review_status<>'pending' or length(trim(coalesce(p_input->>'note','')))=0 then raise exception using errcode='22023',message='退回結訓須填寫原因，且申請必須待審'; end if;
  update public.course_learning_progress set review_status='rejected',reviewed_by=p_actor,reviewed_at=clock_timestamp(),review_note=left(p_input->>'note',1000) where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version;
 end if;
 select to_jsonb(x) into result from public.course_learning_progress x where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version;
 return jsonb_build_object('progress',result,'score',score,'completion',(select jsonb_build_object('document_version',document_version,'completed_at',completed_at) from public.knowledge_course_completions where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version));
end $$;
revoke all on function public.course_is_manager(text,text),public.course_can_learn(text,uuid,text,boolean),public.save_managed_course(text,text,uuid,integer,jsonb),public.guard_managed_document(),public.enforce_managed_completion(),public.course_learning_atomic(text,uuid,text,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.course_is_manager(text,text),public.course_can_learn(text,uuid,text,boolean),public.save_managed_course(text,text,uuid,integer,jsonb),public.course_learning_atomic(text,uuid,text,integer,text,jsonb,text) to service_role;
revoke all on function public.change_course_attachment(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.change_course_attachment(text,text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
