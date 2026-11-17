-- Regression for 20261117170000_signup_orphan_profiles.sql. Synthetic rows
-- only; run inside a transaction that is rolled back (the final RAISE).
do $$
declare
  ghost text := gen_random_uuid()::text;
  live uuid := gen_random_uuid();
  newcomer uuid := gen_random_uuid();
  dup uuid := gen_random_uuid();
  report text := '';
begin
  -- An orphan profile (its auth user is gone) holding an email.
  insert into public.users (id, email, role) values (ghost, 'orphan-regression@example.invalid', 'vendor');

  -- 1. Signing up with that email now works and replaces the orphan.
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', newcomer, 'authenticated', 'authenticated', 'orphan-regression@example.invalid', '{"role":"vendor"}', '{}', now(), now());
  report := report || case when exists (select 1 from public.users where id = newcomer::text and role = 'vendor')
                          and not exists (select 1 from public.users where id = ghost)
                        then 'PASS signup over orphan profile' else 'FAIL signup over orphan profile' end || E'\n';

  -- 2. A live account's profile is never removed by another signup.
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', live, 'authenticated', 'authenticated', 'live-regression@example.invalid', '{}', '{}', now(), now());
  begin
    insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', dup, 'authenticated', 'authenticated', 'live-regression@example.invalid', '{}', '{}', now(), now());
    report := report || 'FAIL duplicate live email was accepted' || E'\n';
  exception when unique_violation then
    report := report || case when exists (select 1 from public.users where id = live::text)
                          then 'PASS live profile kept on duplicate email' else 'FAIL live profile removed' end || E'\n';
  end;

  -- 3. Deleting an auth user deletes its profile.
  delete from auth.users where id = newcomer;
  report := report || case when not exists (select 1 from public.users where id = newcomer::text)
                        then 'PASS profile removed with auth user' else 'FAIL profile left behind' end || E'\n';

  raise exception 'REPORT (rolled back):%', E'\n' || report;
end $$;
