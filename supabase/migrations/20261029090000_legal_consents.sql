-- Versioned legal documents and an append-only record of who accepted what.
--
-- Until now acceptance was one overwritable column (users.terms_version),
-- with no history, no document type and no context, and the signup path
-- trusted a terms_version value in client-supplied auth metadata.
--
--  * legal_document_versions: the current version of each document
--    (public: anyone can see which version is current).
--  * legal_consents: append-only rows (user, document, version, status,
--    context, server timestamp). Users read their own rows; admins read all;
--    nobody updates or deletes through the API. No IP address is stored.
--  * record_legal_acceptance(): signed-in users accept the current versions
--    (Google sign-ins, Terms updates, vendor onboarding).
--  * record_signup_consents(): service role only — the signup server action
--    calls it after validating the checkboxes. (The old path that trusted
--    terms_version in client-controlled auth metadata is removed in the
--    enforcement migration, after the new app code is live.)
--  * set_marketing_consent(): separate, optional, withdrawable.
--  * my_legal_status(): what the signed-in user still needs to accept.
--  * account_deletion_requests + request_account_deletion().
--  * Payment plans can't be proposed or agreed while payments are switched
--    off (the UI promised "held by Evntly" payments that can't happen yet).
--
-- Additive and backward compatible with the currently deployed app (the old
-- signup metadata path and accept_terms() keep working). Enforcement on quotes/messages/bookings/listings lives in
-- the next migration (20261029090100_legal_enforcement.sql), applied after
-- the app code that prompts for acceptance is live.
--
-- Rollback: supabase/rollbacks/20261029090000_legal_consents_down.sql

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create table public.legal_document_versions (
  document text primary key
    check (document in ('customer_terms', 'privacy_policy', 'vendor_agreement',
                        'vendor_fee_schedule', 'cancellation_policy', 'marketing_emails')),
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  updated_at timestamptz not null default now()
);

alter table public.legal_document_versions enable row level security;
create policy legal_document_versions_read on public.legal_document_versions
  for select to anon, authenticated using (true);
revoke all on public.legal_document_versions from anon, authenticated;
grant select on public.legal_document_versions to anon, authenticated;

-- Keep in sync with LEGAL_VERSIONS in src/lib/legal/versions.ts.
insert into public.legal_document_versions (document, version) values
  ('customer_terms', '2026-10-24'),
  ('privacy_policy', '2026-10-24'),
  ('cancellation_policy', '2026-10-24'),
  ('vendor_agreement', '2026-10-24'),
  ('vendor_fee_schedule', '2026-10-24'),
  ('marketing_emails', '2026-10-24');

-- ---------------------------------------------------------------------------
-- Consent records
-- ---------------------------------------------------------------------------
create table public.legal_consents (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately no FK: the record of what someone agreed to is kept after
  -- their account is deleted (see the Privacy Policy's retention section).
  user_id text not null,
  document text not null
    check (document in ('customer_terms', 'privacy_policy', 'vendor_agreement',
                        'vendor_fee_schedule', 'cancellation_policy', 'marketing_emails')),
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  -- accepted: contract terms; acknowledged: notices (Privacy Policy);
  -- granted / withdrawn: optional consents (marketing).
  status text not null check (status in ('accepted', 'acknowledged', 'granted', 'withdrawn')),
  context text not null
    check (context in ('signup', 'signup_google', 'terms_update', 'vendor_onboarding',
                       'settings', 'legacy_backfill')),
  created_at timestamptz not null default now()
);

create index legal_consents_user_doc_idx on public.legal_consents (user_id, document, created_at desc);

alter table public.legal_consents enable row level security;
create policy legal_consents_select_own on public.legal_consents
  for select to authenticated
  using (user_id = (select auth.uid())::text or public.is_admin());
revoke all on public.legal_consents from anon, authenticated;
grant select on public.legal_consents to authenticated;

-- Append-only, even for the table owner's API roles.
create or replace function public.legal_consents_append_only()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'Consent records are append-only';
end;
$$;
create trigger legal_consents_no_update before update or delete on public.legal_consents
  for each row execute function public.legal_consents_append_only();
revoke execute on function public.legal_consents_append_only() from public, anon, authenticated;

-- Existing acceptances of the old (2026-10-20) Terms, so the history is
-- complete. Their acceptance of the new versions is still required.
insert into public.legal_consents (user_id, document, version, status, context, created_at)
select id, 'customer_terms', terms_version, 'accepted', 'legacy_backfill',
       coalesce(terms_accepted_at::timestamptz, now())
from public.users
where terms_version ~ '^\d{4}-\d{2}-\d{2}$';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Documents a user must have accepted at the current version.
create or replace function public.required_legal_documents(p_user_id text)
returns text[]
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when exists (select 1 from public.users u where u.id = p_user_id and u.role = 'vendor')
      or exists (select 1 from public.service_providers sp where sp.owner_user_id::text = p_user_id)
    then array['customer_terms', 'privacy_policy', 'cancellation_policy',
               'vendor_agreement', 'vendor_fee_schedule']
    else array['customer_terms', 'privacy_policy', 'cancellation_policy']
  end;
$$;

-- Whether a user's latest record for a document is at the current version.
create or replace function public.has_current_legal_acceptance(p_user_id text, p_document text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.legal_consents c
    join public.legal_document_versions v on v.document = c.document and v.version = c.version
    where c.user_id = p_user_id
      and c.document = p_document
      and c.status in ('accepted', 'acknowledged')
  );
$$;

revoke execute on function public.required_legal_documents(text) from public, anon, authenticated;
revoke execute on function public.has_current_legal_acceptance(text, text) from public, anon, authenticated;

-- Shared insert used by the user-facing and service-role entry points.
create or replace function public.insert_legal_acceptances(p_user_id text, p_documents text[], p_context text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  doc text;
  cur text;
begin
  foreach doc in array p_documents loop
    if doc = 'marketing_emails' then
      raise exception 'Use set_marketing_consent() for marketing emails';
    end if;
    select version into cur from public.legal_document_versions where document = doc;
    if cur is null then
      raise exception 'Unknown document %', doc;
    end if;
    insert into public.legal_consents (user_id, document, version, status, context)
    values (p_user_id, doc, cur,
            case when doc = 'privacy_policy' then 'acknowledged' else 'accepted' end,
            p_context);
    -- users.terms_version stays as a fast cache for older code paths.
    if doc = 'customer_terms' then
      update public.users
      set terms_version = cur,
          terms_accepted_at = to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      where id = p_user_id;
    end if;
  end loop;
end;
$$;
revoke execute on function public.insert_legal_acceptances(text, text[], text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Entry points
-- ---------------------------------------------------------------------------

create or replace function public.record_legal_acceptance(p_documents text[], p_context text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  if p_context not in ('signup_google', 'terms_update', 'vendor_onboarding') then
    raise exception 'Invalid context';
  end if;
  if p_documents is null or cardinality(p_documents) = 0 or cardinality(p_documents) > 5 then
    raise exception 'No documents';
  end if;
  perform public.insert_legal_acceptances(auth.uid()::text, p_documents, p_context);
end;
$$;
revoke execute on function public.record_legal_acceptance(text[], text) from public, anon;
grant execute on function public.record_legal_acceptance(text[], text) to authenticated;

-- Called by the signup server action (service role) after it has validated
-- the required checkbox. Ignores ids that aren't real accounts (Supabase
-- returns an obfuscated user for an already-registered email).
create or replace function public.record_signup_consents(
  p_user_id text, p_role text, p_marketing boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from auth.users where id::text = p_user_id) then
    return;
  end if;
  perform public.insert_legal_acceptances(
    p_user_id,
    case when p_role = 'vendor'
      then array['customer_terms', 'privacy_policy', 'cancellation_policy', 'vendor_agreement', 'vendor_fee_schedule']
      else array['customer_terms', 'privacy_policy', 'cancellation_policy']
    end,
    'signup');
  insert into public.legal_consents (user_id, document, version, status, context)
  select p_user_id, 'marketing_emails', v.version,
         case when p_marketing then 'granted' else 'withdrawn' end, 'signup'
  from public.legal_document_versions v where v.document = 'marketing_emails';
end;
$$;
revoke execute on function public.record_signup_consents(text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_signup_consents(text, text, boolean) to service_role;

create or replace function public.set_marketing_consent(p_granted boolean, p_context text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  if p_granted is null or p_context not in ('signup_google', 'terms_update', 'settings') then
    raise exception 'Invalid request';
  end if;
  insert into public.legal_consents (user_id, document, version, status, context)
  select auth.uid()::text, 'marketing_emails', v.version,
         case when p_granted then 'granted' else 'withdrawn' end, p_context
  from public.legal_document_versions v where v.document = 'marketing_emails';
end;
$$;
revoke execute on function public.set_marketing_consent(boolean, text) from public, anon;
grant execute on function public.set_marketing_consent(boolean, text) to authenticated;

-- One row per document the user must accept, plus marketing.
create or replace function public.my_legal_status()
returns table (document text, current_version text, required boolean, accepted boolean,
               accepted_at timestamptz, marketing_granted boolean)
language sql
stable
security definer
set search_path to ''
as $$
  with me as (select auth.uid()::text as uid),
  req as (select unnest(public.required_legal_documents((select uid from me))) as document)
  select v.document,
         v.version,
         v.document in (select document from req),
         public.has_current_legal_acceptance((select uid from me), v.document),
         (select max(c.created_at) from public.legal_consents c
           where c.user_id = (select uid from me) and c.document = v.document and c.version = v.version
             and c.status in ('accepted', 'acknowledged')),
         case when v.document = 'marketing_emails' then
           (select c.status = 'granted' from public.legal_consents c
             where c.user_id = (select uid from me) and c.document = 'marketing_emails'
             order by c.created_at desc limit 1)
         end
  from public.legal_document_versions v
  where auth.uid() is not null;
$$;
revoke execute on function public.my_legal_status() from public, anon;
grant execute on function public.my_legal_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion requests
-- ---------------------------------------------------------------------------
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  reason text check (reason is null or char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000)
);
create unique index account_deletion_requests_one_pending
  on public.account_deletion_requests (user_id) where status = 'pending';

alter table public.account_deletion_requests enable row level security;
create policy account_deletion_requests_select on public.account_deletion_requests
  for select to authenticated
  using (user_id = (select auth.uid())::text or public.is_admin());
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;

create or replace function public.request_account_deletion(p_reason text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  rid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  select id into rid from public.account_deletion_requests
  where user_id = auth.uid()::text and status = 'pending';
  if rid is not null then
    return rid;
  end if;
  insert into public.account_deletion_requests (user_id, reason)
  values (auth.uid()::text, nullif(left(trim(coalesce(p_reason, '')), 1000), ''))
  returning id into rid;
  return rid;
end;
$$;
revoke execute on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  update public.account_deletion_requests
  set status = 'cancelled'
  where user_id = auth.uid()::text and status = 'pending';
end;
$$;
revoke execute on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------------------------
-- No payment plans while online payments are switched off
-- ---------------------------------------------------------------------------
create or replace function public.guard_payment_plans_enabled()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Service role, cron and migrations (no end-user JWT) are unaffected.
  if auth.uid() is null then
    return new;
  end if;
  if coalesce((select value from public.app_settings where key = 'payments_enabled'), 'false') <> 'true' then
    raise exception 'Online payments aren''t available yet. Pay the vendor directly.';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_payment_plans_enabled() from public, anon, authenticated;
create trigger guard_payment_plans_enabled before insert or update on public.payment_plans
  for each row execute function public.guard_payment_plans_enabled();
