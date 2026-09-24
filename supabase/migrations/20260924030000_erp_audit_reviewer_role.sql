-- Both EIP sites share this table. Keep the database constraint aligned with
-- the audit_reviewer role already supported by their permission checks.
begin;

alter table public.erp_role_assignments
  drop constraint if exists erp_role_assignments_role_check;

alter table public.erp_role_assignments
  add constraint erp_role_assignments_role_check
  check (role in (
    'super_admin',
    'store_manager',
    'customer_service',
    'audit_reviewer',
    'employee'
  ));

commit;
