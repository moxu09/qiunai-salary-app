begin;
create table public.service_course_links (
 document_id uuid primary key references public.eip_workspace_documents(id) on delete cascade,
 organization_code text not null check(organization_code in ('qiunai','deepnight')),
 slug text not null check(slug ~ '^[a-z0-9-]{1,80}$'),
 is_published boolean not null default false,
 unique(organization_code,slug)
);
alter table public.service_course_links enable row level security;
revoke all on public.service_course_links from public,anon,authenticated;
grant all on public.service_course_links to service_role;
-- These documents stay drafts in the legacy all-employee document APIs.
create function public.protect_service_course() returns trigger
language plpgsql security definer set search_path='' as $$
declare d public.eip_workspace_documents%rowtype;
begin
 if tg_table_name='service_course_links' then
  select * into d from public.eip_workspace_documents where id=new.document_id for update;
  if not found or d.organization_code<>new.organization_code or d.document_type<>'knowledge' then
   raise exception using errcode='22023',message='客服課程所屬店家或類型不正確';
  end if;
  update public.eip_workspace_documents set is_published=false where id=new.document_id;
 elsif exists(select 1 from public.service_course_links where document_id=new.id) then
  if new.is_published or new.organization_code<>old.organization_code or new.document_type<>'knowledge' then
   raise exception using errcode='42501',message='客服課程只能在客服權限內發布';
  end if;
 end if;
 return new;
end $$;
create trigger service_course_link_guard before insert or update on public.service_course_links
 for each row execute function public.protect_service_course();
create trigger service_course_document_guard before update on public.eip_workspace_documents
 for each row execute function public.protect_service_course();
revoke all on function public.protect_service_course() from public,anon,authenticated;
create table public.service_templates (
 id uuid primary key default gen_random_uuid(),
 organization_code text not null check(organization_code in ('qiunai','deepnight')),
 slug text not null check(slug ~ '^[a-z0-9-]{1,80}$'),
 category text not null,title text not null,description text not null default '',
 body text not null check(length(body)<=20000),fields jsonb not null default '[]'::jsonb check(jsonb_typeof(fields)='array' and jsonb_array_length(fields)<=20),
 version integer not null default 1 check(version>0),is_active boolean not null default true,
 destination_label text not null default '',destination_url text,
 starts_at timestamptz,ends_at timestamptz,
 updated_at timestamptz not null default now(),unique(organization_code,slug)
);
create table public.service_guides (
 organization_code text not null check(organization_code in ('qiunai','deepnight')),
 kind text not null check(kind in ('duty','rules','resources')),
 content jsonb not null,updated_at timestamptz not null default now(),
 primary key(organization_code,kind)
);
create table public.service_panel_registry (
 organization_code text primary key check(organization_code in ('qiunai','deepnight')),
 guild_id text not null,channel_id text not null,message_id text,
 lease_owner uuid,lease_until timestamptz,updated_at timestamptz not null default now(),
 check((organization_code='qiunai' and guild_id='1513174069087047731' and channel_id='1566885603637854269')
 or (organization_code='deepnight' and guild_id='1501836172199202856' and channel_id='1502053562799362209'))
);
insert into public.service_panel_registry(organization_code,guild_id,channel_id) values
 ('qiunai','1513174069087047731','1566885603637854269'),('deepnight','1501836172199202856','1502053562799362209');
alter table public.service_templates enable row level security;
alter table public.service_guides enable row level security;
alter table public.service_panel_registry enable row level security;
revoke all on public.service_templates,public.service_guides,public.service_panel_registry from public,anon,authenticated;
grant all on public.service_templates,public.service_guides,public.service_panel_registry to service_role;
create function public.lease_service_panel(p_organization text,p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.service_panel_registry%rowtype;
begin
 update public.service_panel_registry set lease_owner=p_owner,lease_until=clock_timestamp()+interval '90 seconds',updated_at=now()
 where organization_code=p_organization and (lease_until is null or lease_until<clock_timestamp() or lease_owner=p_owner) returning * into r;
 if not found then return null; end if;
 return to_jsonb(r);
end $$;
revoke all on function public.lease_service_panel(text,uuid) from public,anon,authenticated;
grant execute on function public.lease_service_panel(text,uuid) to service_role;
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
 if p_discord_id<>'847840193859682304' and not exists(select 1 from public.erp_role_assignments where organization_code=p_organization and discord_id=p_discord_id and is_active is distinct from false and role in ('super_admin','store_manager','customer_service')) and not ((p_organization='qiunai' and exists(select 1 from public.qiunai_admins where discord_id=p_discord_id and is_active=true)) or (p_organization='deepnight' and exists(select 1 from public.admins where discord_id=p_discord_id and is_active=true))) and ((p_organization='qiunai' and not exists(select 1 from public.qiunai_staff where discord_id=p_discord_id and is_active is distinct from false))
   or (p_organization='deepnight' and not exists(select 1 from public.players where discord_id=p_discord_id and is_active is distinct from false))) then
  raise exception using errcode='42501',message='沒有此店家的在職員工權限';
 end if;
 select * into document from public.eip_workspace_documents
  where id=p_document_id and organization_code=p_organization and document_type='knowledge' and (is_published=true or exists(select 1 from public.service_course_links l where l.document_id=eip_workspace_documents.id and l.organization_code=p_organization and l.is_published)) for share;
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

notify pgrst,'reload schema';
commit;
