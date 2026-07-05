create table if not exists public.accounting_ledger (
  id bigserial primary key,
  app_key text not null,
  dedupe_key text not null,
  occurred_at timestamptz not null default now(),
  entry_type text not null,
  entry_label text,
  amount numeric(12, 2) not null default 0,
  cash_amount numeric(12, 2) not null default 0,
  revenue_amount numeric(12, 2) not null default 0,
  expense_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  liability_amount numeric(12, 2) not null default 0,
  receivable_amount numeric(12, 2) not null default 0,
  payment_method text,
  customer_id text,
  customer_name text,
  staff_id text,
  staff_name text,
  order_id text,
  order_no text,
  source_table text,
  source_id text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists accounting_ledger_app_dedupe_idx
  on public.accounting_ledger (app_key, dedupe_key);

create index if not exists accounting_ledger_app_date_idx
  on public.accounting_ledger (app_key, occurred_at desc);

create index if not exists accounting_ledger_source_idx
  on public.accounting_ledger (source_table, source_id);
