-- Queue one private Xiao Nai reminder per newly created Qiunai EIP message.
-- This migration intentionally does not enqueue historical messages.
create table if not exists public.qiunai_eip_message_notifications (
  message_id uuid primary key references public.eip_direct_messages(id) on delete cascade,
  sender_discord_id text not null,
  recipient_discord_id text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempted_at timestamptz,
  sent_at timestamptz,
  dm_message_id text,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists qiunai_eip_message_notifications_pending_idx
  on public.qiunai_eip_message_notifications (status, created_at)
  where status in ('pending', 'sending');

alter table public.qiunai_eip_message_notifications enable row level security;
revoke all on public.qiunai_eip_message_notifications from public, anon, authenticated;
grant select, update on public.qiunai_eip_message_notifications to service_role;

create or replace function public.enqueue_qiunai_eip_message_notification()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.organization_code = 'qiunai' then
    insert into public.qiunai_eip_message_notifications
      (message_id, sender_discord_id, recipient_discord_id)
    values (new.id, new.sender_discord_id, new.recipient_discord_id)
    on conflict (message_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_qiunai_eip_message_notification() from public, anon, authenticated;
drop trigger if exists enqueue_qiunai_eip_message_notification on public.eip_direct_messages;
create trigger enqueue_qiunai_eip_message_notification
after insert on public.eip_direct_messages
for each row execute function public.enqueue_qiunai_eip_message_notification();
