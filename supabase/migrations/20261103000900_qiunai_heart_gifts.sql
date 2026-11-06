begin;

create table public.qiunai_heart_pairs (
  buyer_id text not null check (buyer_id ~ '^[0-9]{15,22}$'),
  staff_id text not null check (staff_id ~ '^[0-9]{15,22}$'),
  opening_points bigint not null default 0 check (opening_points >= 0),
  earned_points bigint not null default 0 check (earned_points >= 0),
  opening_verified_at timestamptz,
  primary key (buyer_id, staff_id),
  check (buyer_id <> staff_id)
);

create table public.qiunai_heart_legacy_rows (
  source_tab text not null,
  source_row integer not null check (source_row > 0),
  source_column integer not null check (source_column > 0),
  buyer_name text,
  staff_name text,
  points bigint check (points >= 0),
  resolved_buyer_id text,
  resolved_staff_id text,
  resolved_at timestamptz,
  primary key (source_tab, source_row, source_column),
  foreign key (resolved_buyer_id, resolved_staff_id)
    references public.qiunai_heart_pairs(buyer_id, staff_id)
);

create table public.qiunai_heart_checkouts (
  flow_id text primary key check (flow_id ~ '^[0-9]{15,22}_[0-9]{13}$'),
  buyer_id text not null check (buyer_id ~ '^[0-9]{15,22}$'),
  channel_id text not null check (channel_id ~ '^[0-9]{15,22}$'),
  allocations jsonb not null check (jsonb_typeof(allocations) = 'array'),
  payment_method text not null,
  broadcast boolean not null,
  anonymous boolean not null,
  created_at timestamptz not null default now(),
  check (split_part(flow_id, '_', 1) = buyer_id)
);

create table public.qiunai_heart_events (
  id bigint generated always as identity primary key,
  order_id text not null unique,
  flow_id text not null references public.qiunai_heart_checkouts,
  buyer_id text not null,
  staff_id text not null,
  points integer not null check (points > 0),
  previous_total bigint not null,
  total bigint not null,
  lines jsonb not null,
  broadcast boolean not null,
  anonymous boolean not null,
  opening_verified boolean not null,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (flow_id, staff_id),
  foreign key (buyer_id, staff_id) references public.qiunai_heart_pairs,
  check (total = previous_total + points)
);

create table public.qiunai_heart_delivery (
  event_id bigint not null references public.qiunai_heart_events,
  kind text not null check (kind in ('buyer_roles','staff_roles','broadcast')),
  next_attempt_at timestamptz not null default now(),
  lease_owner uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  done_at timestamptz,
  message_ids jsonb not null default '{}'::jsonb,
  primary key (event_id, kind)
);
create index qiunai_heart_delivery_pending on public.qiunai_heart_delivery(next_attempt_at)
  where done_at is null;

alter table public.qiunai_heart_pairs enable row level security;
alter table public.qiunai_heart_legacy_rows enable row level security;
alter table public.qiunai_heart_checkouts enable row level security;
alter table public.qiunai_heart_events enable row level security;
alter table public.qiunai_heart_delivery enable row level security;
revoke all on public.qiunai_heart_pairs, public.qiunai_heart_legacy_rows,
  public.qiunai_heart_checkouts, public.qiunai_heart_events, public.qiunai_heart_delivery
  from public, anon, authenticated, service_role;
grant select on public.qiunai_heart_pairs, public.qiunai_heart_events,
  public.qiunai_heart_checkouts, public.qiunai_heart_legacy_rows to service_role;
grant insert on public.qiunai_heart_checkouts, public.qiunai_heart_legacy_rows to service_role;
grant select, update on public.qiunai_heart_delivery to service_role;

create function public.qiunai_apply_heart_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  checkout public.qiunai_heart_checkouts%rowtype;
  pair public.qiunai_heart_pairs%rowtype;
  allocation jsonb;
  award integer;
  v_event_id bigint;
begin
  if new.guild_id is distinct from '1206138511535898654'
    or coalesce(new.order_group_id, '') not like 'heart:%' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.paid is not true or new.is_deleted is true or new.status = 'cancelled') then
    update public.qiunai_heart_events set reversed_at = now()
      where order_id = new.id::text and reversed_at is null
      returning id, buyer_id, staff_id, points into v_event_id, pair.buyer_id, pair.staff_id, award;
    if v_event_id is not null then
      update public.qiunai_heart_pairs set earned_points = earned_points - award
        where buyer_id = pair.buyer_id and staff_id = pair.staff_id;
      update public.qiunai_heart_delivery set done_at = now(), lease_owner = null, lease_until = null
        where event_id = v_event_id and done_at is null;
    end if;
    return new;
  end if;
  if new.paid is distinct from true or new.is_deleted is true
    or new.status is distinct from 'completed' or new.order_type is distinct from '打賞' then
    return new;
  end if;
  select * into checkout from public.qiunai_heart_checkouts
    where flow_id = substr(new.order_group_id, 7);
  if not found or checkout.buyer_id is distinct from new.customer_id
    or checkout.channel_id is distinct from new.channel_id then
    raise exception '心動值打賞缺少相符的付款資料';
  end if;
  select value into allocation from jsonb_array_elements(checkout.allocations)
    where value->>'staffId' = new.assigned_player;
  award := (allocation->>'amount')::integer;
  if award is null or award <= 0 or award is distinct from new.final_price
    or allocation->>'item' is distinct from new.order_item then
    raise exception '心動值打賞明細與付款資料不一致';
  end if;
  insert into public.qiunai_heart_pairs(buyer_id, staff_id)
    values(checkout.buyer_id, new.assigned_player) on conflict do nothing;
  select * into pair from public.qiunai_heart_pairs
    where buyer_id = checkout.buyer_id and staff_id = new.assigned_player for update;
  insert into public.qiunai_heart_events(order_id, flow_id, buyer_id, staff_id,
      points, previous_total, total, lines, broadcast, anonymous, opening_verified)
    values(new.id::text, checkout.flow_id, pair.buyer_id, pair.staff_id, award,
      pair.opening_points + pair.earned_points, pair.opening_points + pair.earned_points + award,
      allocation->'lines', checkout.broadcast, checkout.anonymous, pair.opening_verified_at is not null)
    on conflict do nothing returning id into v_event_id;
  if v_event_id is null then return new; end if;
  update public.qiunai_heart_pairs set earned_points = earned_points + award
    where buyer_id = pair.buyer_id and staff_id = pair.staff_id;
  insert into public.qiunai_heart_delivery(event_id, kind)
    select v_event_id, kind from unnest(array['buyer_roles','staff_roles','broadcast']) jobs(kind);
  return new;
end $$;

create trigger qiunai_heart_paid_order after insert or update of paid, order_group_id, status, is_deleted
  on public.play_orders for each row execute function public.qiunai_apply_heart_order();

-- Keep the wallet debit, payroll order, and points in one transaction.
create function public.qiunai_pay_heart_wallet(
  p_flow_id text, p_groups jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  checkout public.qiunai_heart_checkouts%rowtype;
  payment_group jsonb;
  payment jsonb;
  orders jsonb := '[]'::jsonb;
  balance numeric;
  group_index integer := 0;
  staff_count integer;
  distinct_staff integer;
begin
  select * into checkout from public.qiunai_heart_checkouts
    where flow_id = p_flow_id for update;
  if not found or jsonb_typeof(p_groups) is distinct from 'array'
    or checkout.payment_method !~ '錢包|儲值|餘額' then
    raise exception '心動值錢包付款資料不正確';
  end if;
  select count(*), count(distinct staff->>'staff_id') into staff_count, distinct_staff
    from jsonb_array_elements(p_groups) g(value)
    cross join lateral jsonb_array_elements(g.value->'staff') s(staff);
  if staff_count <> distinct_staff or staff_count <> jsonb_array_length(checkout.allocations)
    or exists (
      select 1 from jsonb_array_elements(p_groups) g(value)
      group by g.value->>'item', g.value->>'amount' having count(*) > 1
    )
    or exists (
      select 1 from jsonb_array_elements(p_groups) g(value)
      cross join lateral jsonb_array_elements(g.value->'staff') s(staff)
      where not exists (
        select 1 from jsonb_array_elements(checkout.allocations) a(value)
        where a.value->>'staffId' = s.staff->>'staff_id'
          and a.value->>'item' = g.value->>'item'
          and a.value->>'amount' = g.value->>'amount'
      )
    ) then
    raise exception '心動值錢包付款明細不一致';
  end if;
  for payment_group in
    select value from jsonb_array_elements(p_groups) order by value->>'item', (value->>'amount')::integer
  loop
    payment := public.pay_tip_with_wallet_atomic(
      '1206138511535898654:wallet-tip:' || p_flow_id || ':' || group_index,
      '1206138511535898654', checkout.buyer_id, payment_group->>'item',
      (payment_group->>'amount')::integer, checkout.channel_id,
      'qiunai_salary_orders', payment_group->'staff');
    orders := orders || (payment->'orders');
    balance := (payment->>'balance')::numeric;
    group_index := group_index + 1;
  end loop;
  update public.play_orders set order_group_id = 'heart:' || p_flow_id
    where guild_id = '1206138511535898654' and customer_id = checkout.buyer_id
      and channel_id = checkout.channel_id and order_type = '打賞' and paid is true
      and id::text in (select value->>'id' from jsonb_array_elements(orders))
      and order_group_id is distinct from 'heart:' || p_flow_id;
  return jsonb_build_object('orders', orders, 'balance', balance);
end $$;

create function public.qiunai_claim_heart_delivery(p_owner uuid)
returns setof jsonb language sql security definer set search_path = '' as $$
  with candidates as (
    select d.event_id, d.kind from public.qiunai_heart_delivery d
    where d.done_at is null and d.next_attempt_at <= now()
      and (d.lease_until is null or d.lease_until <= now())
      and (d.kind <> 'broadcast' or not exists (
        select 1 from public.qiunai_heart_delivery prior
        join public.qiunai_heart_events prior_event on prior_event.id = prior.event_id
        join public.qiunai_heart_events current_event on current_event.id = d.event_id
        where prior.kind = 'broadcast' and prior.done_at is null and prior.event_id < d.event_id
          and (prior_event.buyer_id, prior_event.staff_id) = (current_event.buyer_id, current_event.staff_id)
      ))
    order by d.next_attempt_at, d.event_id, d.kind limit 8 for update skip locked
  ), claimed as (
    update public.qiunai_heart_delivery d set lease_owner = p_owner,
      lease_until = now() + interval '3 minutes', attempts = d.attempts + 1
    from candidates c where (d.event_id, d.kind) = (c.event_id, c.kind)
    returning d.*
  )
  select to_jsonb(e) || to_jsonb(d)
    from claimed d join public.qiunai_heart_events e on e.id = d.event_id
    order by d.event_id, d.kind;
$$;

create function public.qiunai_resolve_heart_opening(
  p_tab text, p_row integer, p_column integer, p_buyer_id text, p_staff_id text
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  legacy public.qiunai_heart_legacy_rows%rowtype;
  total bigint;
begin
  select * into legacy from public.qiunai_heart_legacy_rows
    where (source_tab, source_row, source_column) = (p_tab, p_row, p_column) for update;
  if not found or legacy.buyer_name is null or legacy.staff_name is null or legacy.points is null then
    raise exception '舊表來源缺少完整配對';
  end if;
  if legacy.resolved_at is not null then
    if (legacy.resolved_buyer_id, legacy.resolved_staff_id) is distinct from (p_buyer_id, p_staff_id) then
      raise exception '此舊表列已確認為其他配對';
    end if;
    select opening_points + earned_points into total from public.qiunai_heart_pairs
      where buyer_id = p_buyer_id and staff_id = p_staff_id;
    return total;
  end if;
  insert into public.qiunai_heart_pairs(buyer_id, staff_id, opening_points, opening_verified_at)
    values(p_buyer_id, p_staff_id, legacy.points, now())
    on conflict (buyer_id, staff_id) do update set
      opening_points = excluded.opening_points, opening_verified_at = excluded.opening_verified_at
      where qiunai_heart_pairs.opening_verified_at is null
    returning opening_points + earned_points into total;
  if not found then raise exception '此配對已承接過舊表累積值'; end if;
  update public.qiunai_heart_legacy_rows set resolved_buyer_id = p_buyer_id,
    resolved_staff_id = p_staff_id, resolved_at = now()
    where (source_tab, source_row, source_column) = (p_tab, p_row, p_column);
  return total;
end $$;

revoke all on function public.qiunai_apply_heart_order(),
  public.qiunai_pay_heart_wallet(text,jsonb),
  public.qiunai_resolve_heart_opening(text,integer,integer,text,text),
  public.qiunai_claim_heart_delivery(uuid) from public, anon, authenticated;
grant execute on function public.qiunai_pay_heart_wallet(text,jsonb),
  public.qiunai_resolve_heart_opening(text,integer,integer,text,text),
  public.qiunai_claim_heart_delivery(uuid) to service_role;

commit;
