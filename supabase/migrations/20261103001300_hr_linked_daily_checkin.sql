begin;

-- Store only the most recent reserved day for each linked account.
create table public.hr_daily_checkin_reservations (
  discord_id text primary key,
  checkin_day date not null
);
alter table public.hr_daily_checkin_reservations enable row level security;
revoke all on public.hr_daily_checkin_reservations from public, anon, authenticated, service_role;

create function public.hr_daily_checkin_group(p_user_id text)
returns text[]
language sql stable
set search_path = pg_catalog, public
as $$
  with account as (
    select coalesce(
      (select primary_id from public.hr_account_links
       where alternate_id = p_user_id and verified_at is not null),
      p_user_id
    ) as primary_id
  )
  select array[a.primary_id] || array(
    select l.alternate_id
    from public.hr_account_links l
    where l.primary_id = a.primary_id and l.verified_at is not null
    order by l.alternate_id
  )
  from account a;
$$;

create function public.hr_daily_checkin_is_reserved(p_accounts text[], p_day date)
returns boolean
language sql stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.users u
    where u.user_id = any(p_accounts) and u.last_checkin = to_char(p_day, 'YYYY-MM-DD')
  ) or exists (
    select 1 from public.hr_daily_checkin_reservations r
    where r.discord_id = any(p_accounts) and r.checkin_day = p_day
  );
$$;

create function public.hr_reserve_daily_checkin(p_accounts text[], p_day date)
returns void
language sql
set search_path = pg_catalog, public
as $$
  insert into public.hr_daily_checkin_reservations as current (discord_id, checkin_day)
  select account, p_day from unnest(p_accounts) as account order by account
  on conflict (discord_id) do update set checkin_day = excluded.checkin_day
  where current.checkin_day < excluded.checkin_day;
$$;

-- Take the shared link lock before the UPDATE acquires any wallet row locks.
-- Withdrawals take the same lock before updating a wallet.
create function public.hr_lock_daily_checkin_links()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('hr-account-links', 0));
  return null;
end;
$$;

create function public.hr_guard_daily_checkin()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Taipei')::date;
  accounts text[];
begin
  if new.last_checkin is null or old.last_checkin is not distinct from new.last_checkin then
    return new;
  end if;

  if new.last_checkin <> to_char(today, 'YYYY-MM-DD') then
    raise exception '簽到日期已變更，請重新簽到' using errcode = 'PDC02';
  end if;

  -- Serialize claims by group, across both bots.
  accounts := public.hr_daily_checkin_group(new.user_id);
  perform pg_advisory_xact_lock(hashtextextended('hr-daily-checkin:' || accounts[1], 0));

  if public.hr_daily_checkin_is_reserved(accounts, today) then
    raise exception '綁定帳號今天已領取每日簽到獎勵' using errcode = 'PDC01';
  end if;
  if cardinality(accounts) > 1 then
    perform public.hr_reserve_daily_checkin(accounts, today);
  end if;
  return new;
end;
$$;

create function public.hr_keep_daily_checkin_on_unlink()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Taipei')::date;
  accounts text[];
begin
  if old.verified_at is null then
    return old;
  end if;
  -- HR's unlink RPC already holds the exclusive hr-account-links lock.
  accounts := public.hr_daily_checkin_group(old.primary_id);
  if public.hr_daily_checkin_is_reserved(accounts, today) then
    perform public.hr_reserve_daily_checkin(accounts, today);
  end if;
  return old;
end;
$$;

revoke all on function public.hr_daily_checkin_group(text), public.hr_daily_checkin_is_reserved(text[], date),
  public.hr_reserve_daily_checkin(text[], date), public.hr_guard_daily_checkin(),
  public.hr_keep_daily_checkin_on_unlink(), public.hr_lock_daily_checkin_links() from public, anon, authenticated, service_role;

create trigger hr_lock_daily_checkin_links before update of last_checkin on public.users
for each statement execute function public.hr_lock_daily_checkin_links();

create trigger hr_guard_daily_checkin before update of last_checkin on public.users
for each row execute function public.hr_guard_daily_checkin();

create trigger hr_keep_daily_checkin_on_unlink before delete on public.hr_account_links
for each row execute function public.hr_keep_daily_checkin_on_unlink();

commit;
