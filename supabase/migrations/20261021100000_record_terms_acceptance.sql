-- Record which version of the Terms each user accepted, and when.
-- Signup already required the Terms checkbox but nothing was stored, and
-- Google sign-in never showed it.
--
--  * Email signup sends terms_version in the auth metadata; the new-user
--    trigger copies it and stamps the time server-side.
--  * Everyone else (Google sign-ins, existing accounts, and everyone after
--    a Terms update) accepts through accept_terms(), which the app prompts
--    for when users.terms_version isn't the current version.
--  * Users can't write the terms fields directly.

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

create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not logged in';
  end if;
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Invalid terms version';
  end if;
  update public.users
  set terms_version = p_version,
      terms_accepted_at = to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  where id = auth.uid()::text;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

create or replace function public.enforce_users_lockdown()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    if not (old.role = 'customer' and new.role = 'vendor') then
      raise exception 'Not authorized to change role';
    end if;
  end if;

  -- Terms acceptance is only recorded through accept_terms().
  if (new.terms_version is distinct from old.terms_version
      or new.terms_accepted_at is distinct from old.terms_accepted_at)
     and not public.is_privileged_writer() then
    raise exception 'Use accept_terms() to accept the Terms';
  end if;

  return new;
end;
$$;
