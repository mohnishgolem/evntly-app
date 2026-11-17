-- Rollback for 20261117170000_signup_orphan_profiles.sql: restores the
-- previous signup trigger body and removes the delete trigger.
drop trigger if exists on_auth_user_deleted on auth.users;
drop function if exists public.handle_deleted_auth_user();

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
