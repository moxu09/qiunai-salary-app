-- 2026 年 9 月秋奈與深夜全員強制 90% 活動抽成。
-- 僅作用於台北時間 2026-09-01 00:00 至 2026-10-01 00:00。
alter table public.salary_activity_commission_settings
  add column if not exists force_rate boolean not null default false;

create or replace function public.apply_salary_activity_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_app_key text := tg_argv[0];
  v_rate numeric;
  v_force_rate boolean;
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

  select activity_rate, force_rate
    into v_rate, v_force_rate
  from public.salary_activity_commission_settings
  where app_key = v_app_key
    and activity_rate is not null
    and starts_at is not null
    and ends_at is not null
    and v_order_time >= starts_at
    and v_order_time < ends_at;

  if v_rate is not null
     and (coalesce(v_force_rate, false) or v_rate > coalesce(new.salary_rate, 0)) then
    new.salary_rate := v_rate;
    new.staff_salary := round(coalesce(new.order_amount, 0) * v_rate / 100);
    new.salary_level := '活動抽成 ' || trim(to_char(v_rate, 'FM999990.##')) || '%';
    new.platform_expense := new.staff_salary + coalesce(new.bonus_amount, 0);
  end if;

  return new;
end;
$function$;

insert into public.salary_activity_commission_settings (
  app_key,
  activity_rate,
  starts_at,
  ends_at,
  force_rate,
  updated_at
)
values
  ('deepnight', 90, '2026-09-01 00:00:00+08', '2026-10-01 00:00:00+08', true, now()),
  ('qiunai', 90, '2026-09-01 00:00:00+08', '2026-10-01 00:00:00+08', true, now())
on conflict (app_key) do update
set activity_rate = excluded.activity_rate,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    force_rate = excluded.force_rate,
    updated_at = excluded.updated_at;

update public.qiunai_salary_orders
set salary_rate = 90,
    staff_salary = round(coalesce(order_amount, 0) * 0.90),
    salary_level = '活動抽成 90%',
    platform_expense = round(coalesce(order_amount, 0) * 0.90) + coalesce(bonus_amount, 0)
where order_finished_at >= '2026-09-01 00:00:00+08'
  and order_finished_at < '2026-10-01 00:00:00+08'
  and wallet_settled_at is null
  and coalesce(is_deleted, false) = false;

update public.play_orders
set salary_rate = 90,
    staff_salary = round(coalesce(order_amount, price, 0) * 0.90),
    salary_level = '活動抽成 90%',
    platform_expense = round(coalesce(order_amount, price, 0) * 0.90) + coalesce(bonus_amount, 0)
where order_finished_at >= '2026-09-01 00:00:00+08'
  and order_finished_at < '2026-10-01 00:00:00+08'
  and wallet_settled_at is null
  and coalesce(is_deleted, false) = false
  and (guild_id = '1501098191813214312' or guild_id is null);

