-- Read-only performance indexes for Qiunai salary and rainbot2 queries.
-- Safe to run repeatedly in the Supabase SQL Editor.

create index if not exists idx_qiunai_salary_orders_staff_finished
  on public.qiunai_salary_orders (discord_id, order_finished_at desc);
create index if not exists idx_qiunai_salary_orders_status_finished
  on public.qiunai_salary_orders (status, order_finished_at desc);
create index if not exists idx_qiunai_staff_discord
  on public.qiunai_staff (discord_id);
create index if not exists idx_qiunai_staff_status
  on public.qiunai_staff (status);
create index if not exists idx_qiunai_bonus_staff_created
  on public.qiunai_staff_bonus (discord_id, created_at desc);
create index if not exists idx_qiunai_services_staff
  on public.qiunai_staff_services (discord_id);
create index if not exists idx_platform_gifts_active_sort
  on public.platform_gifts (is_active, sort_order);
create index if not exists idx_salary_wallet_entries_app_staff_created
  on public.salary_wallet_entries (app_key, discord_id, created_at desc);
create index if not exists idx_salary_withdraw_app_staff_requested
  on public.salary_withdraw_requests (app_key, discord_id, requested_at desc);
create index if not exists idx_accounting_ledger_app_occurred
  on public.accounting_ledger (app_key, occurred_at desc);
