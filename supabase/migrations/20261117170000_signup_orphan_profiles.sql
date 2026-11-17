-- Signup failed with "Database error saving new user" (17 Nov) when the email
-- belonged to an account whose auth.users row had been deleted: its
-- public.users profile was left behind (nothing removes it), so the signup
-- trigger's insert hit users_email_unique and the whole signup rolled back.
--
-- 1. Deleting an auth user now deletes its public.users profile.
-- 2. The signup trigger first removes a profile with the same email that has
--    no auth user (an orphan), so old leftovers can't block a new signup.
--    A profile that still has a live auth user is never touched.
-- Nothing references public.users by foreign key.
-- Rollback: supabase/rollbacks/20261117170000_signup_orphan_profiles.down.sql

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.users p
  where lower(p.email) = lower(new.email)
    and p.id <> new.id::text
    and not exists (select 1 from auth.users a where a.id::text = p.id);

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

create or replace function public.handle_deleted_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.users where id = old.id::text;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_auth_user();

revoke all on function public.handle_deleted_auth_user() from public, anon, authenticated;
