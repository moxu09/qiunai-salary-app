create table if not exists public.salary_activity_commission_settings (
  app_key text primary key check (app_key in ('deepnight', 'qiunai', 'xy')),
  activity_rate numeric(5,2),
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint salary_activity_rate_valid check (
    activity_rate is null or (activity_rate > 0 and activity_rate <= 100)
  ),
  constraint salary_activity_time_valid check (
    starts_at is null or ends_at is null or starts_at < ends_at
  )
);

grant select, insert, update on public.salary_activity_commission_settings
  to authenticated, service_role;

create or replace function public.apply_salary_activity_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_app_key text := tg_argv[0];
  v_rate numeric;
  v_order_time timestamptz;
begin
  if v_app_key = 'deepnight' then
    if new.guild_id is not null
       and new.guild_id <> '1501098191813214312' then
      return new;
    end if;

    v_order_time := coalesce(
      new.order_finished_at::timestamptz,
      new.completed_at::timestamptz,
      new.created_at::timestamptz,
      now()
    );
  else
    v_order_time := coalesce(
      new.order_finished_at::timestamptz,
      new.created_at::timestamptz,
      now()
    );
  end if;

  if new.salary_rate is null or new.order_amount is null then
    return new;
  end if;

  select activity_rate into v_rate
  from public.salary_activity_commission_settings
  where app_key = v_app_key
    and activity_rate is not null
    and starts_at is not null
    and ends_at is not null
    and v_order_time >= starts_at
    and v_order_time < ends_at;

  if v_rate is not null and v_rate > coalesce(new.salary_rate, 0) then
    new.salary_rate := v_rate;
    new.staff_salary := round(coalesce(new.order_amount, 0) * v_rate / 100);
    new.salary_level := '活動抽成 ' || trim(to_char(v_rate, 'FM999990.##')) || '%';
    new.platform_expense := new.staff_salary + coalesce(new.bonus_amount, 0);
  end if;

  return new;
end;
$function$;

drop trigger if exists deepnight_activity_commission_trigger on public.play_orders;
create trigger deepnight_activity_commission_trigger
before insert or update of salary_rate, order_amount, order_finished_at
on public.play_orders
for each row execute function public.apply_salary_activity_commission('deepnight');

drop trigger if exists qiunai_activity_commission_trigger on public.qiunai_salary_orders;
create trigger qiunai_activity_commission_trigger
before insert or update of salary_rate, order_amount, order_finished_at
on public.qiunai_salary_orders
for each row execute function public.apply_salary_activity_commission('qiunai');

drop trigger if exists xy_activity_commission_trigger on public.xy_play_orders;
create trigger xy_activity_commission_trigger
before insert or update of salary_rate, order_amount, order_finished_at
on public.xy_play_orders
for each row execute function public.apply_salary_activity_commission('xy');
