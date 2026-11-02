begin;
-- Keep the course/version/title snapshot even if its source is later removed.
create table public.knowledge_course_completions (
 organization_code text not null check (organization_code in ('qiunai','deepnight')),
 document_id uuid not null,
 discord_id text not null check (discord_id ~ '^[0-9]{15,22}$'),
 document_version integer not null check (document_version>0),
 course_title text not null,
 completed_at timestamptz not null default now(),
 source text not null check (source in ('hr','service-web','discord')),
 primary key(organization_code,document_id,discord_id,document_version)
);
alter table public.knowledge_course_completions enable row level security;
revoke all on public.knowledge_course_completions from public,anon,authenticated,service_role;
grant select on public.knowledge_course_completions to service_role;

create function public.complete_knowledge_course_atomic(
 p_organization text,p_document_id uuid,p_discord_id text,p_expected_version integer,p_source text default 'hr'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 document public.eip_workspace_documents%rowtype;
 completion public.knowledge_course_completions%rowtype;
 created boolean;
begin
 if p_organization is null or p_organization not in ('qiunai','deepnight') or p_document_id is null
   or p_discord_id is null or p_discord_id!~'^[0-9]{15,22}$' or p_expected_version is null
   or p_expected_version<1 or p_source is null or p_source not in ('hr','service-web','discord') then
  raise exception using errcode='22023',message='結訓資料不正確';
 end if;
 if (p_organization='qiunai' and not exists(select 1 from public.qiunai_staff where discord_id=p_discord_id and is_active is distinct from false))
   or (p_organization='deepnight' and not exists(select 1 from public.players where discord_id=p_discord_id and is_active is distinct from false)) then
  raise exception using errcode='42501',message='沒有此店家的在職員工權限';
 end if;
 select * into document from public.eip_workspace_documents
  where id=p_document_id and organization_code=p_organization and document_type='knowledge' and is_published=true for share;
 if not found then raise exception using errcode='P0002',message='課程不存在或尚未發布'; end if;
 if document.version<>p_expected_version then
  raise exception using errcode='40001',message='課程已更新，請重新載入後閱讀並結訓';
 end if;
 insert into public.knowledge_course_completions(organization_code,document_id,discord_id,document_version,course_title,source)
 values(p_organization,p_document_id,p_discord_id,document.version,document.title,p_source)
 on conflict(organization_code,document_id,discord_id,document_version) do nothing
 returning * into completion;
 created:=found;
 if not created then
  select * into completion from public.knowledge_course_completions
   where organization_code=p_organization and document_id=p_document_id and discord_id=p_discord_id and document_version=document.version;
 end if;
 return jsonb_build_object('alreadyCompleted',not created,'completion',jsonb_build_object(
  'document_version',completion.document_version,'completed_at',completion.completed_at));
end $$;
revoke all on function public.complete_knowledge_course_atomic(text,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.complete_knowledge_course_atomic(text,uuid,text,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
