-- quote_requests.share_source can't be changed after the request is sent.
--
-- 20261123090000_vendor_share_profile granted INSERT on the column, but on
-- production authenticated users already hold table-level UPDATE on
-- quote_requests (found when verifying that migration live, 19 Nov 2026), so
-- the column was updatable too. Row security still limits people to their own
-- requests; this keeps the share report honest by making the attribution
-- write-once for everyone except privileged writers (service role, admins'
-- server-side tools), the same rule as the other protected columns.
--
-- Rollback: supabase/rollbacks/20261125090000_quote_share_source_locked.down.sql

create or replace function public.lock_quote_share_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.share_source is distinct from old.share_source and not public.is_privileged_writer() then
    raise exception 'share_source cannot be changed after a quote request is sent';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_quote_share_source() from public, anon, authenticated;

drop trigger if exists trg_quote_requests_share_source_locked on public.quote_requests;
create trigger trg_quote_requests_share_source_locked
  before update of share_source on public.quote_requests
  for each row execute function public.lock_quote_share_source();
