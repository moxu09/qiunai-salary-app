begin;
alter table public.hr_bank_payout_details add column bank_holder text;

create function public.hr_snapshot_bank_holder()
returns trigger language plpgsql set search_path=public as $$
begin
 select nullif(btrim(b.real_name),'') into new.bank_holder
 from (
  select 1 as priority,s.real_name from public.qiunai_staff s
   where s.discord_id=new.primary_discord_id and s.is_active is distinct from false
    and s.bank_name=new.bank_name and s.bank_account=new.bank_account
  union all
  select 2,p.real_name from public.players p
   where p.discord_id=new.primary_discord_id and p.is_active is distinct from false
    and p.bank_name=new.bank_name and p.bank_account=new.bank_account
 ) b order by priority limit 1;
 return new;
end $$;
revoke all on function public.hr_snapshot_bank_holder() from public,anon,authenticated;
create trigger hr_snapshot_bank_holder before insert on public.hr_bank_payout_details
for each row execute function public.hr_snapshot_bank_holder();
notify pgrst, 'reload schema';
commit;
