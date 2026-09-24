create table if not exists public.qiunai_activity_notifications (
  activity_id uuid primary key references public.qiunai_activities(id) on delete cascade,
  announcement_status text not null default 'pending' check (announcement_status in ('pending', 'sending', 'sent')),
  announcement_attempted_at timestamptz,
  announcement_message_id text,
  announcement_sent_at timestamptz,
  recipients_prepared_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.qiunai_activity_notification_deliveries (
  activity_id uuid not null references public.qiunai_activities(id) on delete cascade,
  discord_id text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0,
  dm_message_id text,
  attempted_at timestamptz,
  sent_at timestamptz,
  last_error text,
  primary key (activity_id, discord_id)
);

create index if not exists qiunai_activity_notification_deliveries_pending_idx
  on public.qiunai_activity_notification_deliveries (activity_id, status);

alter table public.qiunai_activity_notifications enable row level security;
alter table public.qiunai_activity_notification_deliveries enable row level security;
revoke all on public.qiunai_activity_notifications from anon, authenticated;
revoke all on public.qiunai_activity_notification_deliveries from anon, authenticated;

create or replace function public.queue_qiunai_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_published then
      insert into public.qiunai_activity_notifications (activity_id)
      values (new.id) on conflict (activity_id) do nothing;
    end if;
  elsif new.is_published and old.is_published is distinct from new.is_published then
    insert into public.qiunai_activity_notifications (activity_id)
    values (new.id) on conflict (activity_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_qiunai_activity_notification_trigger on public.qiunai_activities;
create trigger queue_qiunai_activity_notification_trigger
after insert or update of is_published on public.qiunai_activities
for each row execute function public.queue_qiunai_activity_notification();
