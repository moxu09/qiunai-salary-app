begin;

-- Retire the former options without editing or versioning the course content.
update public.service_course_links
set requirements = requirements || '{"allChapters":false,"approval":false}'::jsonb
where managed and (
  requirements->>'allChapters' = 'true' or requirements->>'approval' = 'true'
);

-- Keep the checks on the completion table so older callers are also protected.
create or replace function public.enforce_managed_completion()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  course public.service_course_links%rowtype;
  progress public.course_learning_progress%rowtype;
  current_version integer;
begin
  select version into current_version
  from public.eip_workspace_documents where id = new.document_id for share;
  select * into course from public.service_course_links
  where document_id = new.document_id and organization_code = new.organization_code;
  if not found or not course.managed then return new; end if;

  if not course.is_published or current_version is distinct from new.document_version then
    raise exception using errcode = '40001', message = '課程已更新或已下架';
  end if;
  if public.course_can_learn(
    new.organization_code, new.document_id, new.discord_id,
    current_setting('app.course_service_learner', true)
      = new.organization_code || ':' || new.document_id::text || ':' || new.discord_id
  ) is not true then
    raise exception using errcode = '42501', message = '不在課程對象內';
  end if;

  select * into progress from public.course_learning_progress
  where organization_code = new.organization_code and document_id = new.document_id
    and discord_id = new.discord_id and document_version = new.document_version for update;
  if not found then
    raise exception using errcode = '22023', message = '尚未達成結訓條件';
  end if;
  if progress.study_seconds < (course.requirements->>'minimumSeconds')::integer then
    raise exception using errcode = '22023', message = '尚未達到最低學習時間';
  end if;
  if jsonb_array_length(course.quiz) > 0
      and coalesce(progress.quiz_score, -1) < (course.requirements->>'passScore')::integer then
    raise exception using errcode = '22023', message = '測驗尚未達到及格分數';
  end if;
  return new;
end;
$$;

create or replace function public.course_learning_atomic(p_org text,p_id uuid,p_actor text,p_version integer,p_action text,p_input jsonb default '{}',p_source text default 'hr') returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.eip_workspace_documents%rowtype;l public.service_course_links%rowtype;p public.course_learning_progress%rowtype;
 target text; elapsed integer; question jsonb; answer integer; correct integer:=0; score integer; result jsonb; chapter text;
begin
 if p_org is null or p_org not in ('qiunai','deepnight') or p_actor is null or p_actor!~'^[0-9]{15,22}$' or p_version is null or p_source is null or p_action is null or p_source not in ('hr','service-web','discord') or p_action not in ('heartbeat','read','quiz','complete') then raise exception using errcode='22023',message='學習資料不正確'; end if;
 -- Lock the document first to use the published policy for this version.
 select * into d from public.eip_workspace_documents
 where id=p_id and organization_code=p_org and document_type='knowledge' for share;
 if not found then raise exception using errcode='P0002',message='找不到課程'; end if;
 select * into l from public.service_course_links where document_id=p_id and organization_code=p_org;
 if not found or not l.is_published or not l.managed then raise exception using errcode='P0002',message='課程未發布'; end if;
 if d.version<>p_version then raise exception using errcode='40001',message='課程已更新，請重新載入'; end if;
 target:=p_actor;
 if public.course_can_learn(p_org,p_id,target,coalesce((p_input->>'serviceAuthorized')::boolean,false)) is not true then
  raise exception using errcode='42501',message='不在課程對象內';
 end if;
 perform set_config('app.course_service_learner',case when coalesce((p_input->>'serviceAuthorized')::boolean,false) then p_org||':'||p_id::text||':'||target else '' end,true);
 if not public.course_is_manager(p_org,target) and not ((p_org='qiunai' and exists(select 1 from public.qiunai_staff where discord_id=target and is_active is distinct from false)) or (p_org='deepnight' and exists(select 1 from public.players where discord_id=target and is_active is distinct from false))) then raise exception using errcode='42501',message='沒有在職員工權限'; end if;
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
 end if;

 select * into p from public.course_learning_progress
 where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version;
 if p_action='complete' or (
   p_action in ('heartbeat', 'quiz')
   and p.study_seconds >= (l.requirements->>'minimumSeconds')::integer
   and (jsonb_array_length(l.quiz)=0 or p.quiz_score >= (l.requirements->>'passScore')::integer)
 ) then
  insert into public.knowledge_course_completions
    (organization_code, document_id, discord_id, document_version, course_title, source)
  values (p_org,p_id,target,p_version,d.title,p_source)
  on conflict do nothing;
 end if;
 result := to_jsonb(p);
 return jsonb_build_object('progress',result,'score',score,'completion',(select jsonb_build_object('document_version',document_version,'completed_at',completed_at) from public.knowledge_course_completions where organization_code=p_org and document_id=p_id and discord_id=target and document_version=p_version));
end $$;

-- Backfill the current version for eligible employees. Learners whose access
-- requires a fresh Discord role check are handled by their next authorized heartbeat.
insert into public.knowledge_course_completions
  (organization_code, document_id, discord_id, document_version, course_title, source)
select p.organization_code, p.document_id, p.discord_id, p.document_version, d.title, 'hr'
from public.course_learning_progress p
join public.eip_workspace_documents d on d.id = p.document_id
  and d.organization_code = p.organization_code and d.version = p.document_version
join public.service_course_links course on course.document_id = p.document_id
  and course.organization_code = p.organization_code
where course.managed and course.is_published and d.archived_at is null
  and p.study_seconds >= (course.requirements->>'minimumSeconds')::integer
  and (jsonb_array_length(course.quiz) = 0
    or p.quiz_score >= (course.requirements->>'passScore')::integer)
  and public.course_can_learn(p.organization_code, p.document_id, p.discord_id, false)
  and not exists (
    select 1 from public.knowledge_course_completions done
    where (done.organization_code, done.document_id, done.discord_id, done.document_version)
      = (p.organization_code, p.document_id, p.discord_id, p.document_version)
  )
on conflict do nothing;

commit;
