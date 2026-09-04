-- 秋奈 2026 年 9 月客服薪資規則：
-- 1. 三位輪班客服一般檔位為 85%；活動期間取活動與個人檔位較高者。
-- 2. 輪班客服底薪 NT$1,500；支援客服底薪 NT$800（僅建立一次）。

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

  select activity_rate
    into v_rate
  from public.salary_activity_commission_settings
  where app_key = v_app_key
    and activity_rate is not null
    and starts_at is not null
    and ends_at is not null
    and v_order_time >= starts_at
    and v_order_time < ends_at;

  if v_rate is not null
     and v_rate > coalesce(new.salary_rate, 0) then
    new.salary_rate := v_rate;
    new.staff_salary := round(coalesce(new.order_amount, 0) * v_rate / 100);
    new.salary_level := '活動抽成 ' || trim(to_char(v_rate, 'FM999990.##')) || '%';
    new.platform_expense := new.staff_salary + coalesce(new.bonus_amount, 0);
  end if;

  return new;
end;
$function$;

update public.qiunai_salary_orders
set salary_rate = 95,
    staff_salary = round(coalesce(order_amount, 0) * 0.95),
    salary_level = '主管津貼 95%',
    platform_expense = round(coalesce(order_amount, 0) * 0.95) + coalesce(bonus_amount, 0)
where discord_id in (
    select discord_id
    from public.qiunai_staff
    where commission_tier = 'manager_95'
      and coalesce(is_active, true) = true
  )
  and order_finished_at >= '2026-09-01 00:00:00+08'
  and order_finished_at < '2026-10-01 00:00:00+08'
  and wallet_settled_at is null
  and coalesce(is_deleted, false) = false;

update public.qiunai_salary_orders
set salary_rate = 90,
    staff_salary = round(coalesce(order_amount, 0) * 0.90),
    salary_level = '活動抽成 90%',
    platform_expense = round(coalesce(order_amount, 0) * 0.90) + coalesce(bonus_amount, 0)
where discord_id not in (
    select discord_id
    from public.qiunai_staff
    where commission_tier = 'manager_95'
      and coalesce(is_active, true) = true
  )
  and order_finished_at >= '2026-09-01 00:00:00+08'
  and order_finished_at < '2026-10-01 00:00:00+08'
  and wallet_settled_at is null
  and coalesce(is_deleted, false) = false;

with base_pay(discord_id, amount, title) as (
  values
    ('808875987034308618', 1500::numeric, '9月客服底薪｜輪班客服'),
    ('450464694818439170', 1500::numeric, '9月客服底薪｜輪班客服'),
    ('1145529569017872394', 1500::numeric, '9月客服底薪｜輪班客服'),
    ('607493124746379274', 800::numeric, '9月客服底薪｜支援客服'),
    ('801749981312581643', 800::numeric, '9月客服底薪｜支援客服'),
    ('519157080503091211', 800::numeric, '9月客服底薪｜支援客服')
)
insert into public.qiunai_staff_bonus (
  discord_id,
  staff_name,
  title,
  amount,
  note,
  created_at
)
select
  base_pay.discord_id,
  coalesce(staff.display_name, staff.real_name, staff.discord_name),
  base_pay.title,
  base_pay.amount,
  '2026 年 9 月客服薪資調整',
  '2026-09-04 00:00:00+08'::timestamptz
from base_pay
left join public.qiunai_staff staff
  on staff.discord_id = base_pay.discord_id
where not exists (
  select 1
  from public.qiunai_staff_bonus existing
  where existing.discord_id = base_pay.discord_id
    and existing.title = base_pay.title
    and existing.created_at >= '2026-09-01 00:00:00+08'
    and existing.created_at < '2026-10-01 00:00:00+08'
);
