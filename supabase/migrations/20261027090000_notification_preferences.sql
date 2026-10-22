-- Per-user notification preferences: which kinds of notification arrive by
-- email and by push. Missing keys mean "on" (the app normalises), so a user
-- with no row gets everything, as before.
--
-- prefs = {"email": {"enquiries": true, …}, "push": {…}}
--
-- Users read and write only their own row. The server reads the RECIPIENT's
-- row with the service role when sending, so senders never see it.
-- Rollback: drop table public.notification_preferences;

create table if not exists public.notification_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 4000),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
