-- Phase 2 — apply ONLY AFTER every admin has enrolled an authenticator app at
-- /profile/security and logged in with it. Applying it earlier locks admins
-- out of admin data (their sessions would only be aal1).
--
-- The app already requires an aal2 session for admin pages and actions; this
-- makes the database enforce the same thing, so a stolen admin password (or
-- a session token from before MFA) can't be used against the API directly.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())::text and u.role = 'admin'
  )
  and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;
