alter table public.salary_withdraw_requests
  add column if not exists service_fee numeric(12, 2) not null default 0,
  add column if not exists welfare_fee numeric(12, 2) not null default 0,
  add column if not exists payout_amount numeric(12, 2);

update public.salary_withdraw_requests
set payout_amount = amount - service_fee - welfare_fee
where payout_amount is null;

alter table public.salary_withdraw_requests
  alter column payout_amount set not null;

notify pgrst, 'reload schema';
