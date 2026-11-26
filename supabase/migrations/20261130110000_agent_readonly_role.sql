-- Least-privilege, read-only login for the vendor acquisition agent
-- (option B in docs/ai-agents/READONLY-DB-ACCESS.md, approved by Sai 26 Nov 2026).
--
-- Why: the hosted Supabase connector's read-only user (supabase_read_only_user)
-- is a member of pg_read_all_data, so it can read Vault secrets,
-- app_settings.cron_secret, password hashes and auth tokens. This role can read
-- only the columns the agent's SQL files use, plus the prospect pipeline.
--
-- The role is created WITHOUT a password, so nobody can log in as it until Sai
-- sets one outside any migration:   alter role evntly_agent_ro password '…';
-- (from the SQL editor), then stores it in the macOS Keychain.
--
-- Rollback: supabase/rollbacks/20261130110000_agent_readonly_role.down.sql

-- 1. The login. Read-only by default, short statements, few connections.
--    BYPASSRLS is deliberate: RLS policies are written for app users
--    (anon/authenticated); for this role the column grants below are the limit.
create role evntly_agent_ro with login nosuperuser nocreatedb nocreaterole noreplication
  bypassrls noinherit connection limit 3;
alter role evntly_agent_ro set default_transaction_read_only = on;
alter role evntly_agent_ro set statement_timeout = '15s';
alter role evntly_agent_ro set idle_in_transaction_session_timeout = '30s';

-- 2. auth.users: postgres cannot grant on the auth schema, so expose only the
--    non-secret columns the SQL files use, through a view owned by postgres
--    in a schema the Data API does not serve.
create schema agent_read;
revoke all on schema agent_read from public;

create view agent_read.auth_users with (security_barrier) as
  select id, email_confirmed_at, last_sign_in_at, created_at,
         jsonb_build_object('full_name', raw_user_meta_data->>'full_name',
                            'name', raw_user_meta_data->>'name') as raw_user_meta_data
  from auth.users;
revoke all on agent_read.auth_users from public, anon, authenticated;

grant usage on schema agent_read to evntly_agent_ro;
grant select on agent_read.auth_users to evntly_agent_ro;

-- 3. public: column-level SELECT only, matching the agent's SQL files
--    (.claude/skills/evntly-acquisition-truth/sql/*, evntly-pipeline-tracker/sql/*
--    except record_event.sql). Add a column here when a file needs it.
grant usage on schema public to evntly_agent_ro;

grant select (id, email, role, created_at) on public.users to evntly_agent_ro;
grant select (id, owner_user_id, name, service_type, status, social_link, is_demo, created_at)
  on public.service_providers to evntly_agent_ro;
grant select (id, provider_id) on public.portfolio_items to evntly_agent_ro;
grant select (id, provider_id, active) on public.vendor_packages to evntly_agent_ro;
grant select (id, user_id, provider_id, source, campaign, status, submitted_at, decided_at, created_at)
  on public.beta_applications to evntly_agent_ro;
grant select (email_normalized) on public.vendor_waitlist to evntly_agent_ro;
grant select (provider_id, status) on public.listing_setup_requests to evntly_agent_ro;
grant select (vendor_user_id, service_type, responded_at, created_at) on public.quote_requests to evntly_agent_ro;
grant select (sender_user_id, created_at) on public.messages to evntly_agent_ro;

-- The prospect pipeline is the agent's own working data.
grant select on public.vendor_prospects to evntly_agent_ro;
grant select on public.vendor_prospect_events to evntly_agent_ro;

-- 4. Nothing else is granted: no sequences, no other schemas. The role still
--    holds what PUBLIC holds (e.g. pg_net queue writes, large objects); the
--    read-only default and the evntly-ro-db connector's READ ONLY transaction
--    block those.
comment on role evntly_agent_ro is
  'Read-only login for the Evntly vendor acquisition agent. Column grants only. See docs/ai-agents/READONLY-DB-ACCESS.md.';
