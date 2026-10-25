-- Server-side enforcement of legal acceptance.
--
-- The Terms prompt in the app is an overlay; without this, anyone could keep
-- calling the API without accepting the current documents. Signed-in users
-- must have accepted the current Terms, Cancellation Policy and acknowledged
-- the Privacy Policy before they can request quotes, send messages or create
-- bookings; vendors must also have accepted the Vendor Service Agreement and
-- fee schedule before creating a listing or applying to an event.
--
-- Checks use the acting user (auth.uid()), so they also apply inside the
-- security-definer RPCs (accept_quote, book_bundle, ...). Service role,
-- cron and triggers with no end-user JWT are unaffected; admins are exempt.
--
-- APPLY ONLY AFTER the app code that records acceptance (legal-compliance
-- branch) is deployed, or existing users will hit errors with no prompt.
-- Rollback: supabase/rollbacks/20261029090100_legal_enforcement_down.sql

create or replace function public.enforce_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid text := auth.uid()::text;
  docs text[] := case when tg_argv[0] = 'vendor'
    then array['customer_terms', 'privacy_policy', 'cancellation_policy', 'vendor_agreement', 'vendor_fee_schedule']
    else array['customer_terms', 'privacy_policy', 'cancellation_policy']
  end;
  doc text;
begin
  if uid is null or public.is_admin() then
    return new;
  end if;
  foreach doc in array docs loop
    if not public.has_current_legal_acceptance(uid, doc) then
      -- The app maps this prefix to a friendly "please accept" message.
      raise exception 'LEGAL_ACCEPTANCE_REQUIRED: %', doc using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.enforce_legal_acceptance() from public, anon, authenticated;

create trigger enforce_legal_quote_requests before insert on public.quote_requests
  for each row execute function public.enforce_legal_acceptance('user');
create trigger enforce_legal_messages before insert on public.messages
  for each row execute function public.enforce_legal_acceptance('user');
create trigger enforce_legal_bookings before insert on public.bookings
  for each row execute function public.enforce_legal_acceptance('user');
create trigger enforce_legal_service_providers before insert on public.service_providers
  for each row execute function public.enforce_legal_acceptance('vendor');
create trigger enforce_legal_event_applications before insert on public.event_applications
  for each row execute function public.enforce_legal_acceptance('vendor');

-- New accounts no longer get terms_version from client-supplied metadata;
-- the signup server action records acceptance through the service role.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.users (id, email, role)
  values (
    new.id::text,
    new.email,
    case when new.raw_user_meta_data ->> 'role' = 'vendor' then 'vendor' else 'customer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The old single-version RPC is superseded by record_legal_acceptance().
revoke execute on function public.accept_terms(text) from authenticated;

