begin;
create or replace function public.hr_update_profile_atomic(p_discord_id text,p_profile jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_discord_id is null or p_discord_id!~'^\d{15,22}$' then raise exception '員工身分無效';end if;
 update public.players set real_name=p_profile->>'real_name',phone=p_profile->>'phone',gender=p_profile->>'gender',birthday=nullif(p_profile->>'birthday','')::date,bank_name=p_profile->>'bank_name',bank_account=p_profile->>'bank_account',updated_at=now() where discord_id=p_discord_id and is_active is distinct from false and (p_profile->'_organizations') ? 'deepnight';
 update public.qiunai_staff set real_name=p_profile->>'real_name',phone=p_profile->>'phone',gender=p_profile->>'gender',birthday=nullif(p_profile->>'birthday','')::date,bank_name=p_profile->>'bank_name',bank_account=p_profile->>'bank_account',updated_at=now() where discord_id=p_discord_id and is_active is distinct from false and (p_profile->'_organizations') ? 'qiunai';
end $$;

create or replace function public.hr_update_services_atomic(p_discord_id text,p_organization text,p_services jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_names text[];v_games text[];
begin
 if p_organization not in ('qiunai','deepnight') or jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)>50 then raise exception '部門或服務項目無效';end if;
 select coalesce(array_agg(item->>'allowed'),'{}'::text[]),coalesce(array_agg(distinct item->>'group'),'{}'::text[]) into v_names,v_games from jsonb_array_elements(p_services) item;
 if p_organization='qiunai' then
  perform 1 from qiunai_staff where discord_id=p_discord_id and is_active is distinct from false for update;
  if not found then raise exception '沒有此部門的在職員工權限';end if;
  delete from qiunai_staff_services where discord_id=p_discord_id;
  insert into qiunai_staff_services(discord_id,service_key,service_name,enabled,updated_at) select p_discord_id,item->>'key',item->>'name',true,now() from jsonb_array_elements(p_services) item;
  update qiunai_staff set allowed_services=to_jsonb(v_names),updated_at=now() where discord_id=p_discord_id;
 else
  perform 1 from players where discord_id=p_discord_id and is_active is distinct from false for update;
  if not found then raise exception '沒有此部門的在職員工權限';end if;
  delete from players_services where discord_id=p_discord_id;
  insert into players_services(discord_id,service_key,service_name,category,enabled,updated_at) select p_discord_id,item->>'key',item->>'name',item->>'group',true,now() from jsonb_array_elements(p_services) item;
  update players set allowed_services=v_names,updated_at=now() where discord_id=p_discord_id;
 end if;
 update salary_public_profiles set games=v_games,updated_at=now() where discord_id=p_discord_id and app_key=p_organization;
end $$;
revoke all on function public.hr_update_services_atomic(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.hr_update_services_atomic(text,text,jsonb) to service_role;

create or replace function public.hr_update_department_profile_atomic(p_discord_id text,p_organization text,p_profile jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_staff jsonb;
begin
 if p_organization='qiunai' then
  update qiunai_staff set display_name=p_profile->>'display_name',avatar_url=p_profile->>'avatar_url',public_intro=p_profile->>'intro',public_note=p_profile->>'note',updated_at=now() where discord_id=p_discord_id and is_active is distinct from false returning to_jsonb(qiunai_staff) into v_staff;
 elsif p_organization='deepnight' then
  update players set display_name=p_profile->>'display_name',avatar_url=p_profile->>'avatar_url',updated_at=now() where discord_id=p_discord_id and is_active is distinct from false returning to_jsonb(players) into v_staff;
 else raise exception '部門設定無效';end if;
 if v_staff is null then raise exception '沒有此部門的在職員工權限';end if;
 insert into salary_public_profiles(app_key,discord_id,display_name,avatar_url,intro,note,invite_url,is_active,is_online,can_take_order,updated_at)
 values(p_organization,p_discord_id,coalesce(p_profile->>'display_name',v_staff->>'discord_name',p_discord_id),p_profile->>'avatar_url',p_profile->>'intro',p_profile->>'note',p_profile->>'invite_url',true,coalesce((v_staff->>'is_online')::boolean,false),coalesce((v_staff->>'can_take_order')::boolean,true),now())
 on conflict(app_key,discord_id) do update set display_name=excluded.display_name,avatar_url=excluded.avatar_url,intro=excluded.intro,note=excluded.note,invite_url=excluded.invite_url,updated_at=now();
end $$;
revoke all on function public.hr_update_department_profile_atomic(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.hr_update_department_profile_atomic(text,text,jsonb) to service_role;

commit;
