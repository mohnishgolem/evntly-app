# Evntly security notes

## Where enforcement lives

The browser holds the public Supabase anon key, so **anyone can call the
database API directly**. Every rule therefore lives in Postgres (RLS policies
plus insert/update guard triggers). Server actions repeat the checks only to
give friendly errors. Never rely on UI checks alone.

- `supabase/migrations/*security_hardening.sql`: insert guards for listings,
  bookings, quotes, reviews, bundles, portfolio items, job cards; rate limits;
  admin audit log.
- `supabase/migrations/*admin_requires_mfa.sql`: database-level MFA for
  admins. **Apply only after every admin has enrolled at `/profile/security`.**
- The service-role client (`src/lib/supabase/admin.ts`) bypasses RLS. It is
  server-only and limited to notification addresses, the calendar feed and
  rate-limit counters.

## Admin access

- Admin pages and actions require the `admin` role **and** an MFA-verified
  (aal2) session. Enrol an authenticator app at `/profile/security`.
- Role changes, listing status changes and report decisions are recorded in
  `public.admin_audit_log` (admin-read-only).
- `ADMIN_MFA_OPTIONAL=true` disables the app-level MFA requirement. It is an
  emergency switch only; never set it in production.

## Running the security tests

```bash
npm test                      # unit/authorization tests (no network)
npm audit --omit=dev          # runtime dependency advisories
psql "$BRANCH_DB_URL" -f supabase/tests/security_regression.sql   # DB attacks + legit flows; branch/local only
node scripts/security/anon-probe.mjs  # read-only anon exposure check
```

Every line of the SQL regression report must start with `PASS`. The script
creates synthetic users and always rolls back.

CI (`.github/workflows/security.yml`) runs lint, typecheck, tests, build,
`npm audit` (high+), gitleaks and Semgrep on every push and PR, plus a weekly
run. Dependabot opens weekly dependency PRs.

## Backups and recovery

- Supabase Free has **no automatic backups**. Before launch, upgrade to Pro
  (daily backups, 7-day retention) and consider PITR once there is payment
  data.
- Until then, take a manual dump before every migration:
  `supabase db dump --linked -f backup-$(date +%F).sql` (schema) and
  `supabase db dump --linked --data-only -f data-$(date +%F).sql`.
- Recovery: restore from the dashboard (Pro), or `psql "$DB_URL" -f <dump>`
  into a fresh project, then repoint `NEXT_PUBLIC_SUPABASE_URL`/keys in Vercel.

## If a key leaks

1. Rotate it in Supabase (API settings) or Resend, then update Vercel env vars
   and redeploy.
2. A leaked **service-role** key bypasses all RLS. Treat it as a full data
   breach until rotated. Check Supabase logs for use from unknown IPs.

## Reporting a vulnerability

Email hello@evntlyapp.com. Please don't test against real users' data.
