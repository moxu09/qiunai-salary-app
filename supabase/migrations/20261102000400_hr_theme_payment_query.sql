begin;
alter table public.hr_theme_orders add column if not exists submitted_at timestamptz;
alter table public.hr_theme_orders add column if not exists last_queried_at timestamptz;
commit;
