# Real-database QA (local Supabase, no production access)

Runs the vendor journey against **real** Postgres 17 + Auth + PostgREST + pg_cron + Mailpit,
loaded with production's schema only (no rows).

1. Schema: `pg_dump --schema-only --schema=public --no-owner` of production into `~/evntly-schema.sql`
   (the owner runs it; it asks for the database password).
2. `npx supabase start` in a scratch folder with `[auth.email] enable_confirmations = true`, the
   confirm-signup template from `docs/launch/supabase-confirm-signup-template.html`, `site_url`
   `http://localhost:3105`.
3. Load: `psql -f evntly-schema.sql`, then `create extension btree_gist with schema extensions`
   (+ the `bookings_vendor_no_overlap` constraint), `create extension pg_cron`, the three
   `auth.users` triggers (`on_auth_user_created`, `on_auth_user_deleted`,
   `on_auth_user_email_change`), and the reference rows in `legal_document_versions` and
   `beta_program`.
4. Apply the new migrations, build the app against `http://127.0.0.1:54321`, `next start -p 3105`.
5. `export LOCAL_ANON_KEY=… LOCAL_SERVICE_ROLE_KEY=… LOCAL_JWT_SECRET=…` (from `supabase status`), then
   `node tests/e2e/real-supabase/access-probe.mjs` and
   `node tests/e2e/real-supabase/journey.mjs <screenshot dir>`. `reset.sql` clears the test rows.
