begin;
set local lock_timeout = '5s';

create or replace function public.employment_contract_v22_order_blockers(p_discord_ids text[])
returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(candidate.discord_id order by candidate.discord_id), array[]::text[])
  from (
    select distinct btrim(item.discord_id) as discord_id
    from unnest(p_discord_ids) as item(discord_id)
    where btrim(item.discord_id) <> ''
  ) as candidate
  where statement_timestamp() >= timestamptz '2026-12-01 00:00:00+08'
    and not exists (
      select 1
      from public.employment_contract_signings as signing
      where signing.discord_id = candidate.discord_id
        and signing.organization_code in ('qiunai', 'deepnight')
        and signing.contract_version = 'v2.2'
        and signing.contract_sha256 = 'abca0bf344776cd05038efe701b93f3c2577c8da38990c0f91fa4347668b2afe'
        and signing.status in ('signed', 'activated')
        and signing.signed_at is not null
        and nullif(signing.signed_pdf_path, '') is not null
        and nullif(signing.signed_pdf_sha256, '') is not null
    );
$$;

create or replace function public.guard_employment_contract_v22_order_assignment()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  previous_players text[] := array[]::text[];
  added_players text[];
begin
  if statement_timestamp() < timestamptz '2026-12-01 00:00:00+08'
    or coalesce(new.guild_id::text, '') not in ('1206138511535898654', '1501098191813214312')
    or new.order_type = '打賞'
    or coalesce(new.order_id, '') like 'WORK-%'
    or coalesce(new.order_no, '') like 'WORK-%' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.guild_id::text = new.guild_id::text then
    if new.assigned_player is not distinct from old.assigned_player then return new; end if;
    previous_players := regexp_split_to_array(btrim(coalesce(old.assigned_player, '')), '\s*,\s*');
  end if;

  added_players := array(
    select player_id
    from regexp_split_to_table(btrim(coalesce(new.assigned_player, '')), '\s*,\s*') as item(player_id)
    where player_id <> '' and not (player_id = any(previous_players))
  );
  if cardinality(added_players) > 0
    and cardinality(public.employment_contract_v22_order_blockers(added_players)) > 0 then
    raise exception using errcode = 'EC022',
      message = '請先到 HR／EIP 待辦完成新版合約 v2.2 簽署，才能接新單。';
  end if;
  return new;
end;
$$;

revoke all on function public.employment_contract_v22_order_blockers(text[]) from public, anon, authenticated;
grant execute on function public.employment_contract_v22_order_blockers(text[]) to service_role;
revoke all on function public.guard_employment_contract_v22_order_assignment() from public, anon, authenticated;

create or replace trigger guard_employment_contract_v22_order_assignment
  before insert or update of assigned_player, guild_id on public.play_orders
  for each row execute function public.guard_employment_contract_v22_order_assignment();

notify pgrst, 'reload schema';
commit;
