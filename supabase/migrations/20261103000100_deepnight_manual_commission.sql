-- Preserve manual DeepNight tiers at the existing salary normalization boundary.
begin;
create index if not exists play_orders_active_work_parent_idx on public.play_orders
 ((lower(substring(coalesce(nullif(order_id,''),nullif(order_no,'')) from '(?i)^WORK-([0-9a-f-]{36})-[0-9]+$'))))
 where not coalesce(is_deleted,false);
create index if not exists salary_wallet_deepnight_target_order_idx on public.salary_wallet_entries
 ((metadata->>'target_order_id')) where app_key='deepnight';
CREATE OR REPLACE FUNCTION public.sync_play_order_salary_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
declare resolved_staff_name text;
  resolved_commission_tier text;
  resolved_rate integer;
  finished_at timestamp without time zone;
  manual_rate integer;
  deepnight_staff text;
  salary_changed boolean;
  is_deepnight boolean;
  begin
  deepnight_staff := coalesce(nullif(new.discord_id, ''), nullif(new.assigned_player, ''));
  is_deepnight := (new.guild_id = '1501098191813214312' or
    (new.guild_id is null and exists(select 1 from public.players p where p.discord_id = deepnight_staff)));
  -- The preceding source/WORK dedupe trigger clears the source salary. Do not
  -- repopulate its employee or salary from assigned_player afterwards.
  if is_deepnight and exists(select 1 from public.play_orders w
    where not coalesce(w.is_deleted,false) and
      lower(substring(coalesce(nullif(w.order_id,''),nullif(w.order_no,'')) from '(?i)^WORK-([0-9a-f-]{36})-[0-9]+$'))=new.id::text) then
    return new;
  end if;
  finished_at := coalesce(new.order_finished_at, new.completed_at, new.created_at, now());
  if finished_at < timestamp '2026-09-01 00:00:00' then resolved_rate := 90;
  else select commission_tier into resolved_commission_tier from public.players where discord_id = coalesce(nullif(new.discord_id, ''), nullif(new.assigned_player, '')) limit 1;
  resolved_rate := case resolved_commission_tier when 'rate_80' then 80 when 'rate_85' then 85 when 'rate_90' then 90 when 'manager_95' then 95 else 80 end;
  end if;
  if new.discord_id is null or new.discord_id = '' then if new.assigned_player is not null and new.assigned_player <> '' then new.discord_id := new.assigned_player;
  end if;
  end if;
  if new.staff_name is null or new.staff_name = '' then select coalesce(display_name, real_name, discord_name, discord_id) into resolved_staff_name from public.players where discord_id = new.discord_id limit 1;
  new.staff_name := coalesce( resolved_staff_name, new.assigned_player, new.discord_id );
  end if;
  if new.service_name is null or new.service_name = '' then new.service_name := new.service;
  end if;
  if new.order_amount is null then new.order_amount := new.price;
  end if;
  if new.price is null then new.price := new.order_amount;
  end if;
  if new.completed_at is null and new.order_finished_at is not null then new.completed_at := new.order_finished_at;
  end if;
  if new.order_finished_at is null then new.order_finished_at := coalesce(new.completed_at, new.created_at, now());
  end if;
  if new.bonus_amount is null then new.bonus_amount := 0;
  end if;
  salary_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    salary_changed := old.wallet_settled_at is null and
      (new.status is distinct from old.status or new.discord_id is distinct from old.discord_id
       or new.assigned_player is distinct from old.assigned_player
       or new.order_amount is distinct from old.order_amount or new.price is distinct from old.price
       or new.order_type is distinct from old.order_type or new.service_name is distinct from old.service_name
       or new.review_decision is distinct from old.review_decision or new.order_finished_at is distinct from old.order_finished_at);
  end if;
  if is_deepnight and salary_changed and new.wallet_settled_at is null
     and not coalesce(new.is_deleted,false) and new.review_decision is distinct from 'rejected'
     and new.status in ('completed','已完成','已入帳','已發薪','未入帳','未發薪')
     and coalesce(new.order_amount,new.price,0)>0
     and not exists(select 1 from public.salary_wallet_entries e
       where e.app_key='deepnight' and
         ((e.source_table='play_orders' and e.source_id=new.id::text)
          or e.metadata->>'target_order_id'=new.id::text)) then
    select case p.commission_tier when 'rate_80' then 80 when 'rate_85' then 85
      when 'rate_90' then 90 when 'manager_95' then 95 end into manual_rate
      from public.players p where p.discord_id=deepnight_staff limit 1;
    if manual_rate is not null then
      if (coalesce(new.order_type,'') like '%打賞%' or coalesce(new.service_name,new.service,'') like '%打賞%')
        and manual_rate<>95 then manual_rate:=90;
  end if;
      if finished_at < timestamp '2026-09-01 00:00:00' then
        manual_rate:=greatest(manual_rate,90);
      end if;
      -- A campaign may improve a manual tier, but must not reduce it.
      select greatest(manual_rate,coalesce(max(a.activity_rate),manual_rate))::integer into manual_rate
        from public.salary_activity_commission_settings a where a.app_key='deepnight'
        and finished_at::timestamptz>=a.starts_at and finished_at::timestamptz<a.ends_at;
      new.salary_rate:=manual_rate;
      new.staff_salary:=round(coalesce(new.order_amount,new.price,0)*manual_rate::numeric/100)::integer;
      new.salary_level:='手動抽成 '||manual_rate::text||'%';
      new.platform_expense:=new.staff_salary+coalesce(new.bonus_amount,0);
  end if;
  end if;
  if new.salary_rate is null then new.salary_rate := resolved_rate;
  end if;
  if new.salary_level is null then new.salary_level := case new.salary_rate when 90 then '開幕期 / 達標 90%' when 85 then '累積接單達標 85%' when 95 then '主管津貼 95%' else '預設 80%' end;
  end if;
  if new.staff_salary is null and coalesce(new.order_amount, new.price, 0) > 0 then new.staff_salary := round( coalesce(new.order_amount, new.price, 0) * (new.salary_rate::numeric / 100) )::integer;
  end if;
  if new.platform_income is null then new.platform_income := coalesce(new.order_amount, new.price, 0);
  end if;
  if new.platform_expense is null then new.platform_expense := coalesce(new.staff_salary, 0) + coalesce(new.bonus_amount, 0);
  end if;
  if new.is_deleted is null then new.is_deleted := false;
  end if;
  return new;
  end;
  $function$;
create table public.deepnight_commission_audit (
 id bigint generated always as identity primary key,
 player_id uuid not null, discord_id text not null, old_tier text, new_tier text,
 changed_at timestamptz not null default now(), transaction_id bigint not null default txid_current(),
 session_role text, jwt_role text, jwt_subject text, application_name text
);
alter table public.deepnight_commission_audit enable row level security;
revoke all on public.deepnight_commission_audit from public, anon, authenticated, service_role;
grant select on public.deepnight_commission_audit to service_role;
create function public.audit_deepnight_commission_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.commission_tier is distinct from new.commission_tier then
  insert into public.deepnight_commission_audit(player_id,discord_id,old_tier,new_tier,session_role,jwt_role,jwt_subject,application_name)
  values(new.id,new.discord_id,old.commission_tier,new.commission_tier,session_user,
   coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role',
   coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub',
   current_setting('application_name',true));
  end if;
 return new;
end $$;
revoke all on function public.audit_deepnight_commission_change() from public,anon,authenticated;
create trigger audit_deepnight_commission_change after update of commission_tier on public.players
 for each row execute function public.audit_deepnight_commission_change();
commit;
