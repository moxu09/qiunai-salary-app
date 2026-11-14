begin;
set local lock_timeout = '5s';
create table public.hr_discord_offboarding (
  request_id uuid primary key references public.salary_requests(id),
  organization_code text not null check (organization_code in ('qiunai','deepnight')),
  discord_id text not null check (discord_id ~ '^[0-9]{15,22}$'),
  status text not null default 'pending' check (status in ('pending','running','completed','attention','cancelled')),
  retry_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.hr_discord_offboarding enable row level security;
revoke all on public.hr_discord_offboarding from public, anon, authenticated;
grant select on public.hr_discord_offboarding to service_role;
create index hr_discord_offboarding_pending on public.hr_discord_offboarding(organization_code,retry_at)
  where status in ('pending','running','attention');

create function public.hr_queue_discord_offboarding() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'approved' and new.request_type = '離職申請書'
    and exists (select 1 from public.hr_resignation_settlements where request_id = new.id) then
    insert into public.hr_discord_offboarding(request_id,organization_code,discord_id)
    values(new.id,new.organization_code,new.discord_id) on conflict (request_id) do nothing;
  end if;
  return new;
end $$;
create trigger hr_queue_discord_offboarding after update of status on public.salary_requests
for each row execute function public.hr_queue_discord_offboarding();

create function public.hr_discord_offboarding_active(p_org text,p_user text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_org
    when 'qiunai' then not exists (select 1 from public.qiunai_staff where discord_id=p_user and is_active=false)
      or exists (select 1 from public.qiunai_staff where discord_id=p_user and is_active is distinct from false)
    when 'deepnight' then not exists (select 1 from public.players where discord_id=p_user and guild_id::text='1501098191813214312' and is_active=false)
      or exists (select 1 from public.players where discord_id=p_user and guild_id::text='1501098191813214312' and is_active is distinct from false)
    else true end
$$;

create function public.hr_claim_discord_offboarding(p_org text)
returns setof public.hr_discord_offboarding language sql security definer set search_path = '' as $$
  with due as (
    select request_id from public.hr_discord_offboarding
    where organization_code=p_org and status in ('pending','running','attention') and retry_at <= now()
    order by retry_at limit 1 for update skip locked
  )
  update public.hr_discord_offboarding q
  set status='running',attempts=q.attempts+1,retry_at=now()+interval '5 minutes'
  from due where q.request_id=due.request_id returning q.*;
$$;

create function public.hr_finish_discord_offboarding(p_org text,p_id uuid,p_attempt integer,p_status text)
returns boolean language sql security definer set search_path = '' as $$
  with done as (
    update public.hr_discord_offboarding q set status=p_status,
      retry_at=now()+case when p_status='attention' then interval '1 hour' else interval '1 minute' end
    where organization_code=p_org and request_id=p_id and attempts=p_attempt
      and retry_at > now() and status='running' and p_status in ('pending','attention','completed','cancelled')
    returning 1
  ) select exists(select 1 from done);
$$;
revoke all on function public.hr_queue_discord_offboarding(), public.hr_discord_offboarding_active(text,text),
  public.hr_claim_discord_offboarding(text),public.hr_finish_discord_offboarding(text,uuid,integer,text)
  from public, anon, authenticated;
grant execute on function public.hr_discord_offboarding_active(text,text),
  public.hr_claim_discord_offboarding(text),public.hr_finish_discord_offboarding(text,uuid,integer,text) to service_role;
create function public.hr_cancel_discord_offboarding_on_restore() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  org text := case tg_table_name when 'qiunai_staff' then 'qiunai' else 'deepnight' end;
begin
  if old.is_active is distinct from false or new.is_active is distinct from true then return new; end if;
  if tg_table_name = 'players' then
    if new.guild_id::text is distinct from '1501098191813214312' then return new; end if;
  end if;
  perform 1 from public.hr_discord_offboarding where organization_code=org and discord_id=new.discord_id
    and status in ('pending','running','attention') order by request_id for update;
  if exists (select 1 from public.hr_discord_offboarding where organization_code=org
    and discord_id=new.discord_id and status='running' and retry_at > clock_timestamp()) then
    raise exception '離職 Discord 身分組仍在處理，請稍後再恢復在職狀態' using errcode='23514';
  end if;
  update public.hr_discord_offboarding set status='cancelled'
    where organization_code=org and discord_id=new.discord_id and status in ('pending','running','attention');
  return new;
end $$;
create trigger hr_cancel_discord_offboarding_on_restore before update of is_active on public.qiunai_staff
for each row execute function public.hr_cancel_discord_offboarding_on_restore();
create trigger hr_cancel_discord_offboarding_on_restore before update of is_active on public.players
for each row execute function public.hr_cancel_discord_offboarding_on_restore();
revoke all on function public.hr_cancel_discord_offboarding_on_restore() from public, anon, authenticated;
notify pgrst,'reload schema';
commit;
