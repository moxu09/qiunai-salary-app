begin;
-- Keep the explicit ACL even when replacing a pre-existing function.
revoke all on function public.complete_knowledge_course_atomic(text,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.complete_knowledge_course_atomic(text,uuid,text,integer,text) to service_role;
create function public.service_template_version() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.body,new.fields,new.title,new.description,new.destination_label,new.destination_url,new.is_active,new.starts_at,new.ends_at)
  is distinct from (old.body,old.fields,old.title,old.description,old.destination_label,old.destination_url,old.is_active,old.starts_at,old.ends_at) then
  new.version:=greatest(new.version,old.version+1);
 else new.version:=old.version;
 end if;
 new.updated_at:=now();
 return new;
end $$;
create trigger service_template_version before update on public.service_templates
 for each row execute function public.service_template_version();
revoke all on function public.service_template_version() from public,anon,authenticated;
-- eip_workspace_document_revision already increments versions on all document updates.
-- Avoid a spurious document edit when only its private publication mapping changes.
create or replace function public.protect_service_course() returns trigger
language plpgsql security definer set search_path='' as $$
declare d public.eip_workspace_documents%rowtype;
begin
 if tg_table_name='service_course_links' then
  select * into d from public.eip_workspace_documents where id=new.document_id for update;
  if not found or d.organization_code<>new.organization_code or d.document_type<>'knowledge' then
   raise exception using errcode='22023',message='客服課程所屬店家或類型不正確';
  end if;
  if d.is_published is distinct from false then
   update public.eip_workspace_documents set is_published=false where id=new.document_id;
  end if;
 elsif exists(select 1 from public.service_course_links where document_id=new.id) then
  if new.is_published or new.organization_code<>old.organization_code or new.document_type<>'knowledge' then
   raise exception using errcode='42501',message='客服課程只能在客服權限內發布';
  end if;
 end if;
 return new;
end $$;
create function public.complete_service_course_atomic(
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
 if p_discord_id<>'847840193859682304' and not exists(select 1 from public.erp_role_assignments where organization_code=p_organization and discord_id=p_discord_id and is_active is distinct from false and role in ('super_admin','store_manager','customer_service')) and not ((p_organization='qiunai' and exists(select 1 from public.qiunai_admins where discord_id=p_discord_id and is_active=true)) or (p_organization='deepnight' and exists(select 1 from public.admins where discord_id=p_discord_id and is_active=true))) and ((p_organization='qiunai' and not exists(select 1 from public.qiunai_staff where discord_id=p_discord_id and is_active is distinct from false))
   or (p_organization='deepnight' and not exists(select 1 from public.players where discord_id=p_discord_id and is_active is distinct from false))) then
  raise exception using errcode='42501',message='沒有此店家的在職員工權限';
 end if;
 select * into document from public.eip_workspace_documents
  where id=p_document_id and organization_code=p_organization and document_type='knowledge' and exists(select 1 from public.service_course_links l where l.document_id=eip_workspace_documents.id and l.organization_code=p_organization and l.is_published) for share;
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

revoke all on function public.complete_service_course_atomic(text,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.complete_service_course_atomic(text,uuid,text,integer,text) to service_role;
create or replace function public.complete_knowledge_course_atomic(
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
