begin;
create table public.service_manual_entries (
 id uuid primary key default gen_random_uuid(),organization_code text not null check(organization_code in ('qiunai','deepnight')),
 kind text not null check(kind in ('flow','scene','phrase','rule','resource','command','price','campaign')),
 slug text not null check(slug ~ '^[a-z0-9-]{1,80}$'),title text not null check(length(title) between 1 and 160),
 category text not null default '',summary text not null default '',content jsonb not null default '{}',
 storage_path text,version integer not null default 1 check(version>0),sort_order integer not null default 0,
 is_active boolean not null default true,starts_at timestamptz,ends_at timestamptz,updated_at timestamptz not null default now(),
 search_text text generated always as (title||' '||category||' '||summary||' '||content::text) stored,
 unique(organization_code,kind,slug),check(storage_path is null or storage_path like organization_code||'/manual/%'),
 check(length(content::text)<=1000000),check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create index service_manual_store_kind on public.service_manual_entries(organization_code,kind,is_active,sort_order);
create function public.service_manual_version() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.title,new.category,new.summary,new.content,new.storage_path,new.is_active,new.starts_at,new.ends_at) is distinct from (old.title,old.category,old.summary,old.content,old.storage_path,old.is_active,old.starts_at,old.ends_at) then new.version:=old.version+1;else new.version:=old.version;end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger service_manual_revision before update on public.service_manual_entries for each row execute function public.service_manual_version();

create table public.service_desk_records (
 id uuid primary key default gen_random_uuid(),organization_code text not null check(organization_code in ('qiunai','deepnight')),
 kind text not null check(kind in ('note','track','broadcast')),owner_discord_id text not null check(owner_discord_id ~ '^[0-9]{15,22}$'),
 label text not null check(length(label) between 1 and 100),body text not null default '' check(length(body)<=case when kind='broadcast' then 10000 else 2000 end),
 customer_discord_id text check(customer_discord_id ~ '^[0-9]{15,22}$'),guild_id text,channel_id text,
 url text,priority boolean not null default false,archived_at timestamptz,
 version integer not null default 1,created_by text not null,updated_by text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(case when kind in ('note','broadcast') then guild_id is null and channel_id is null and url is null
 when kind='track' then (guild_id ~ '^[0-9]{15,22}$' and channel_id ~ '^[0-9]{15,22}$' and url='https://discord.com/channels/'||guild_id||'/'||channel_id) is true else false end),
 check(case when kind='track' then ((organization_code='qiunai' and guild_id in ('1206138511535898654','1513174069087047731')) or (organization_code='deepnight' and guild_id in ('1501098191813214312','1501836172199202856'))) is true else true end)
);
create index service_desk_store_owner on public.service_desk_records(organization_code,kind,owner_discord_id,archived_at);
create unique index service_desk_unique_active_track on public.service_desk_records(organization_code,owner_discord_id,channel_id) where kind='track' and archived_at is null;
create table public.service_desk_audit (
 id bigint generated always as identity primary key,record_id uuid not null references public.service_desk_records(id),organization_code text not null,
 actor_discord_id text not null,action text not null,old_value jsonb,new_value jsonb,created_at timestamptz not null default now()
);
alter table public.service_manual_entries enable row level security;
alter table public.service_desk_records enable row level security;
alter table public.service_desk_audit enable row level security;
revoke all on public.service_manual_entries,public.service_desk_records,public.service_desk_audit from public,anon,authenticated,service_role;
grant select,insert,update on public.service_manual_entries to service_role;
grant select on public.service_desk_records,public.service_desk_audit to service_role;

create function public.service_desk_change(p_org text,p_actor text,p_id uuid,p_version integer,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_row public.service_desk_records%rowtype;new_row public.service_desk_records%rowtype;record_kind text;total integer;
begin
 if p_org is null or p_org not in ('qiunai','deepnight') or p_actor is null or p_actor!~'^[0-9]{15,22}$' or p_action is null or p_action not in ('save','archive','restore') then raise exception using errcode='22023',message='客服工作資料不正確';end if;
 if p_id is not null then
  select * into old_row from public.service_desk_records where id=p_id and organization_code=p_org and (kind<>'track' or owner_discord_id=p_actor) for update;
  if not found then raise exception using errcode='P0002',message='找不到工作紀錄';end if;
  if p_version is null or old_row.version<>p_version then raise exception using errcode='40001',message='紀錄已由其他人更新，請重新載入';end if;
  record_kind:=old_row.kind;
 else
  if p_action<>'save' then raise exception using errcode='22023',message='工作紀錄不正確';end if;
  record_kind:=p_data->>'kind';
 end if;
 if record_kind is null or record_kind not in ('note','track','broadcast') then raise exception using errcode='22023',message='工作紀錄類型不正確';end if;
 if p_action='save' and p_data->>'kind' is distinct from record_kind then raise exception using errcode='22023',message='工作紀錄類型不可變更';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org||':'||record_kind||':'||case when record_kind='track' then p_actor else 'shared' end,0));
 if p_id is null or p_action='restore' then
  select count(*) into total from public.service_desk_records where organization_code=p_org and service_desk_records.kind=record_kind and archived_at is null and (record_kind<>'track' or owner_discord_id=p_actor);
  if total>=(case when record_kind='track' then 50 else 1000 end) then raise exception using errcode='22023',message='工作紀錄數量已達上限，請先封存完成的項目';end if;
 end if;
 if p_action='save' then
  if jsonb_typeof(p_data) is distinct from 'object' or length(trim(coalesce(p_data->>'label',''))) not between 1 and 100 or length(coalesce(p_data->>'body',''))>(case when record_kind='broadcast' then 10000 else 2000 end) then raise exception using errcode='22023',message='名稱或備註長度不正確';end if;
  if p_id is null then
   insert into public.service_desk_records(organization_code,kind,owner_discord_id,label,body,customer_discord_id,guild_id,channel_id,url,priority,created_by,updated_by)
   values(p_org,record_kind,p_actor,trim(p_data->>'label'),coalesce(p_data->>'body',''),nullif(p_data->>'customerId',''),case when record_kind='track' then p_data->>'guildId' end,case when record_kind='track' then p_data->>'channelId' end,case when record_kind='track' then 'https://discord.com/channels/'||(p_data->>'guildId')||'/'||(p_data->>'channelId') end,coalesce((p_data->>'priority')::boolean,false),p_actor,p_actor) returning * into new_row;
  else
   update public.service_desk_records set label=trim(p_data->>'label'),body=coalesce(p_data->>'body',''),customer_discord_id=nullif(p_data->>'customerId',''),priority=coalesce((p_data->>'priority')::boolean,false),guild_id=case when record_kind='track' then p_data->>'guildId' end,channel_id=case when record_kind='track' then p_data->>'channelId' end,url=case when record_kind='track' then 'https://discord.com/channels/'||(p_data->>'guildId')||'/'||(p_data->>'channelId') end,updated_by=p_actor,updated_at=clock_timestamp(),version=version+1 where id=p_id and organization_code=p_org returning * into new_row;
  end if;
 else
  update public.service_desk_records set archived_at=case when p_action='archive' then clock_timestamp() else null end,updated_by=p_actor,updated_at=clock_timestamp(),version=version+1 where id=p_id returning * into new_row;
 end if;
 insert into public.service_desk_audit(record_id,organization_code,actor_discord_id,action,old_value,new_value) values(new_row.id,p_org,p_actor,p_action,case when old_row.id is not null then to_jsonb(old_row) end,to_jsonb(new_row));
 return to_jsonb(new_row);
end $$;
revoke all on function public.service_desk_change(text,text,uuid,integer,text,jsonb),public.service_manual_version() from public,anon,authenticated;
grant execute on function public.service_desk_change(text,text,uuid,integer,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
