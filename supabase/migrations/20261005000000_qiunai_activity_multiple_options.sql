begin;

alter table public.qiunai_activities add column if not exists allow_multiple_options boolean not null default false;
alter table public.qiunai_activity_responses add column if not exists selected_option_ids uuid[] not null default '{}'::uuid[];
update public.qiunai_activity_responses
set selected_option_ids = array[selected_option_id]
where selected_option_id is not null and cardinality(selected_option_ids) = 0;

create or replace function public.qiunai_validate_activity_choices()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  multiple_allowed boolean;
  option_count integer;
begin
  -- Serialize responses and changes of selection mode on the same activity.
  select allow_multiple_options into multiple_allowed from public.qiunai_activities
  where id = new.activity_id for update;
  if not found then raise exception '找不到活動'; end if;
  if tg_op = 'INSERT' then
    if cardinality(new.selected_option_ids) = 0 and new.selected_option_id is not null then
      new.selected_option_ids := array[new.selected_option_id];
    end if;
  elsif new.selected_option_ids is not distinct from old.selected_option_ids
      and new.selected_option_id is distinct from old.selected_option_id then
    -- Support already-open legacy clients that still send only one option.
    new.selected_option_ids := case when new.selected_option_id is null
      then '{}'::uuid[] else array[new.selected_option_id] end;
  end if;
  if new.response_status <> 'attending' then
    new.selected_option_ids := '{}'::uuid[];
    new.selected_option_id := null;
    return new;
  end if;
  if cardinality(new.selected_option_ids) > 20 or array_position(new.selected_option_ids, null) is not null
      or cardinality(new.selected_option_ids) <> (select count(distinct id) from unnest(new.selected_option_ids) id) then
    raise exception '活動選項格式不正確';
  end if;
  if not multiple_allowed and cardinality(new.selected_option_ids) > 1 then
    raise exception '此活動只能選擇一個活動選項';
  end if;
  if exists (
    select 1 from unnest(new.selected_option_ids) selected(id)
    where not exists (select 1 from public.qiunai_activity_options o where o.id = selected.id and o.activity_id = new.activity_id)
  ) then raise exception '活動選項不屬於此活動'; end if;
  select count(*) into option_count from public.qiunai_activity_options where activity_id = new.activity_id;
  if option_count > 0 and cardinality(new.selected_option_ids) = 0 then
    raise exception '請至少選擇一個活動選項';
  end if;
  new.selected_option_id := new.selected_option_ids[1];
  return new;
end;
$$;

create or replace function public.qiunai_validate_activity_selection_mode()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not new.allow_multiple_options and old.allow_multiple_options and exists (
    select 1 from public.qiunai_activity_responses
    where activity_id = new.id and cardinality(selected_option_ids) > 1
  ) then raise exception '已有員工提交複選回覆，請先請員工改為單一選項，再關閉複選'; end if;
  return new;
end;
$$;

create or replace function public.qiunai_protect_selected_activity_option()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform 1 from public.qiunai_activities where id = old.activity_id for update;
  if found and exists (select 1 from public.qiunai_activity_responses
        where activity_id = old.activity_id and old.id = any(selected_option_ids)) then
    raise exception '已有員工選擇的活動選項不能刪除，請保留該選項';
  end if;
  return old;
end;
$$;

drop trigger if exists qiunai_activity_choices_validation on public.qiunai_activity_responses;
create trigger qiunai_activity_choices_validation before insert or update on public.qiunai_activity_responses
for each row execute function public.qiunai_validate_activity_choices();
drop trigger if exists qiunai_activity_mode_validation on public.qiunai_activities;
create trigger qiunai_activity_mode_validation before update of allow_multiple_options on public.qiunai_activities
for each row execute function public.qiunai_validate_activity_selection_mode();
drop trigger if exists qiunai_activity_selected_option_protection on public.qiunai_activity_options;
create trigger qiunai_activity_selected_option_protection before delete on public.qiunai_activity_options
for each row execute function public.qiunai_protect_selected_activity_option();

revoke all on function public.qiunai_validate_activity_choices() from public, anon, authenticated;
revoke all on function public.qiunai_validate_activity_selection_mode() from public, anon, authenticated;
revoke all on function public.qiunai_protect_selected_activity_option() from public, anon, authenticated;
commit;
