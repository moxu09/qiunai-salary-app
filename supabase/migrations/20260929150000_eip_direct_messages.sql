-- EIP one-to-one messaging. Only server-side service_role may access this table.
create table if not exists public.eip_direct_messages (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('qiunai', 'deepnight')),
  sender_discord_id text not null check (sender_discord_id ~ '^[0-9]{15,22}$'),
  recipient_discord_id text not null check (recipient_discord_id ~ '^[0-9]{15,22}$'),
  client_nonce uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint eip_direct_messages_no_self check (sender_discord_id <> recipient_discord_id),
  constraint eip_direct_messages_nonce_unique unique (organization_code, sender_discord_id, client_nonce)
);

create index if not exists eip_direct_messages_sender_idx
  on public.eip_direct_messages (organization_code, sender_discord_id, created_at desc);
create index if not exists eip_direct_messages_recipient_idx
  on public.eip_direct_messages (organization_code, recipient_discord_id, created_at desc);
create index if not exists eip_direct_messages_unread_idx
  on public.eip_direct_messages (organization_code, recipient_discord_id, sender_discord_id)
  where read_at is null;

alter table public.eip_direct_messages enable row level security;
revoke all on public.eip_direct_messages from public, anon, authenticated;
grant select, insert, update on public.eip_direct_messages to service_role;

create or replace function public.eip_list_conversations(p_org text, p_discord_id text)
returns table (
  peer_discord_id text,
  last_body text,
  last_at timestamptz,
  unread_count bigint
)
language sql stable security invoker
set search_path = public
as $$
  with scoped as (
    select
      case when m.sender_discord_id = p_discord_id
        then m.recipient_discord_id else m.sender_discord_id end as peer_id,
      m.body, m.created_at, m.id
    from public.eip_direct_messages m
    where m.organization_code = p_org
      and (m.sender_discord_id = p_discord_id or m.recipient_discord_id = p_discord_id)
  ),
  latest as (
    select distinct on (peer_id) peer_id, body, created_at
    from scoped
    order by peer_id, created_at desc, id desc
  ),
  unread as (
    select m.sender_discord_id as peer_id, count(*) as count
    from public.eip_direct_messages m
    where m.organization_code = p_org
      and m.recipient_discord_id = p_discord_id
      and m.read_at is null
    group by m.sender_discord_id
  )
  select l.peer_id, l.body, l.created_at, coalesce(u.count, 0)
  from latest l
  left join unread u on u.peer_id = l.peer_id
  order by l.created_at desc;
$$;
revoke all on function public.eip_list_conversations(text, text) from public, anon, authenticated;
grant execute on function public.eip_list_conversations(text, text) to service_role;
