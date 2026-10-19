-- Admins can now mark listings as founding vendors from /admin (they sort
-- first and get a badge). Record those changes in admin_audit_log alongside
-- listing status and role changes. Owners can't change the flag themselves
-- (enforce_service_providers_lockdown), so every change here is an admin's.

create or replace function public.log_founding_vendor_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.founding_vendor is distinct from old.founding_vendor then
    insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
    values (auth.uid(), 'founding_vendor', 'service_providers', new.id,
            jsonb_build_object('founding_vendor', old.founding_vendor),
            jsonb_build_object('founding_vendor', new.founding_vendor));
  end if;
  return null;
end;
$$;

revoke execute on function public.log_founding_vendor_change() from public, anon, authenticated;

drop trigger if exists trg_service_providers_founding_audit on public.service_providers;
create trigger trg_service_providers_founding_audit
  after update of founding_vendor on public.service_providers
  for each row execute function public.log_founding_vendor_change();
