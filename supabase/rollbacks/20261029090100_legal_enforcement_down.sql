-- Rollback for 20261029090100_legal_enforcement.sql. Removes the checks only;
-- consent records are untouched.
drop trigger if exists enforce_legal_quote_requests on public.quote_requests;
drop trigger if exists enforce_legal_messages on public.messages;
drop trigger if exists enforce_legal_bookings on public.bookings;
drop trigger if exists enforce_legal_service_providers on public.service_providers;
drop trigger if exists enforce_legal_event_applications on public.event_applications;
drop function if exists public.enforce_legal_acceptance();

-- Restore the previous signup trigger (terms_version from auth metadata)
-- and the accept_terms() grant.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  accepted_version text := new.raw_user_meta_data ->> 'terms_version';
begin
  if accepted_version is not null and accepted_version !~ '^\d{4}-\d{2}-\d{2}$' then
    accepted_version := null;
  end if;

  insert into public.users (id, email, role, terms_version, terms_accepted_at)
  values (
    new.id::text,
    new.email,
    case when new.raw_user_meta_data ->> 'role' = 'vendor' then 'vendor' else 'customer' end,
    accepted_version,
    case when accepted_version is null then null else to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
grant execute on function public.accept_terms(text) to authenticated;
