-- 將秋奈薪資訂單的狀態用語由「發薪」統一為「入帳」。
-- 已有錢包入帳時間的資料，以錢包狀態為準標記為已入帳。
update public.qiunai_salary_orders
set
  status = '已入帳',
  paid_at = coalesce(wallet_settled_at, paid_at)
where wallet_settled_at is not null
   or status = '已發薪';

update public.qiunai_salary_orders
set status = '未入帳'
where wallet_settled_at is null
  and status = '未發薪';
