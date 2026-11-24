# Release runbook — PR #97 (vendor journey + growth dashboard), then PR #98

**Nothing below has been run against production. Each numbered step needs Sai's go-ahead.**

## Pre-release checks

| Check | Status | Evidence |
|---|---|---|
| CI on #97 (test-and-build, SAST, secret scan, dependency audit, Vercel preview) | ✅ green | `gh pr checks 97` |
| Unit + SQL tests | ✅ 125 files, all pass | `npx vitest run` |
| Typecheck, lint, production build | ✅ | `tsc`, `eslint`, isolated `next build` |
| Migration on a **real** Postgres/Supabase | ⏳ waiting for the schema-only dump (`~/evntly-schema.sql`); branch spend declined | see "Real-database test" below |
| Migration compatible with production data (read-only) | ✅ every existing `page_views.kind` and `funnel_events.event` is allowed by the new checks; no name clashes; `pg_cron` + `pgcrypto` present; no existing rows modified | read-only SELECTs, 24 Nov |
| RLS / access (offline PGlite) | ✅ drafts + test-account helper service-role only; anon/vendor/admin-role direct access denied; funnel + dashboard admin+MFA only; spend log admin+MFA only | `tests/sql/vendor-listing-drafts.test.ts`, `growth-dashboard.test.ts` |
| Claim-link security, token expiry | ✅ hash-only storage, guessed/old/rotated links refused, expired/claimed/revoked unusable, assisted drafts savable only by the owner's verified email, noindex + no-referrer | unit + E2E |
| Drafts survive refresh, device switch, email verification | ✅ device storage + server copy; resumed on a second device via private link; sign-up lands on `/vendor-signup` which forwards to the saved draft | E2E 60/60 |
| Storage limits, rate limits, spam, cleanup | ✅ draft JSON ≤ 32 KB (DB check) and per-field trimming; 60 saves/h/IP, 15 suggestions/h/IP, draft-link email 5/h/IP + 3/day/address; daily purge 30 days after expiry | migration, `rate-limit.ts`, SQL test |
| Existing vendors, customers, listings, bookings, plans unaffected | ✅ migration adds tables/functions and widens two checks only; old listing form now shares `createVendorListing` (existing tests pass); customer E2E suite passes | tests |
| Accessibility | ✅ axe WCAG 2.1 A/AA + best practice: **0 violations** on landing, all 7 questions, review and claim, light and dark; keyboard-only flow works, focus moves to each question | `a11y-perf` run |
| Performance (4× CPU, ~1.6 Mbps) | ✅ `/become-a-vendor` LCP 0.90 s, CLS 0 (current `/founding-vendors`: 0.88 s, CLS 0); builder LCP 0.86 s, CLS 0, +~140 KB JS (suburb picker, preview, sheet) | same run |
| Visual match with the coral design system | ✅ existing tokens only; light + dark screenshots in `screenshots/after/` | |
| Analytics separation | ✅ guest drafts (self vs assisted, admin browsers excluded) → verified accounts → listings → approved → completed → genuine enquiries (real customer → real vendor, not self, not demo, not test) → confirmed bookings | SQL tests |

**Do not release until the real-database row above is ✅.**

## Real-database test (once `~/evntly-schema.sql` exists)
1. Load the dump into the local Supabase stack (OrbStack, `scratchpad/localsb`, real Postgres 17 + Auth + PostgREST + pg_cron + Mailpit).
2. Apply `20261130090000`, then `20261130100000`; then both rollbacks; then both again (idempotence).
3. Probe as `anon`, a vendor JWT and an admin JWT through PostgREST: drafts/spend/helper not readable or writable; RPCs return nothing without admin+MFA.
4. Run the app against it with real Auth: sign up as a vendor, read the code from Mailpit, verify → land on the saved draft → ABN + agreement → listing created as **draft** with packages.
5. Assisted draft: save is refused for a different verified email; allowed for the owner's.
6. Check `check_rate_limit` really blocks the 4th draft-link email to one address.

## Release sequence

| Step | Action | Verify | If it fails |
|---|---|---|---|
| 0 | Note row counts: page_views 1761, funnel_events 141, service_providers 27, bookings 0, events 10, users 37 (24 Nov) and confirm today's backup exists (Supabase → Database → Backups) | counts recorded | stop |
| 1 | Apply `supabase/migrations/20261130090000_vendor_listing_drafts.sql` | `select to_regclass('public.vendor_listing_drafts')` not null; `select jobname from cron.job where jobname = 'purge-expired-vendor-listing-drafts'`; row counts unchanged | run its rollback |
| 2 | Apply `supabase/migrations/20261130100000_growth_dashboard.sql` | `select * from public.admin_growth_daily(3)` as admin returns 3 rows | run its rollback |
| 3 | Merge #97 → Vercel production deploy | deployment Ready | Vercel: promote the previous deployment |
| 4 | Production smoke (from your admin browser, so it's excluded from analytics): open `/become-a-vendor`, answer two questions, check Admin → Vendor drafts funnel and Admin → Growth load; open `/founding-vendors`, `/vendor-signup`, `/explore`, `/plan`, a vendor profile | pages 200, no new runtime errors (Vercel → Runtime errors) | promote previous deployment |
| 5 | Watch 48 h: runtime errors, `funnel_events` for `builder_*` and `draft_saved`, no spike in signup errors | dashboard | as above |
| 6 | Merge #98 (Claim → builder; Home/How it works → `/become-a-vendor`) | Claim from `/founding-vendors?src=meta_ads` opens `/become-a-vendor/start?src=meta_ads` and the page view/claim click keep `meta_ads` | revert #98 only |
| 7 | Update Instagram bio and DM links (launch kit). Ads stay paused | | |

## Rollback

- **Code:** Vercel → Deployments → promote the deployment before #97 (instant). #98 can be reverted on its own.
- **Database (reverse order):**
  1. `supabase/rollbacks/20261130100000_growth_dashboard.down.sql` — drops the dashboard functions and **the spend log**.
  2. `supabase/rollbacks/20261130090000_vendor_listing_drafts.down.sql` — drops drafts (unsaved guest/assisted drafts are lost), the funnel and helper functions, the purge job; deletes the new funnel events and page-view kinds and restores the old checks.
  - Listings already created from drafts are ordinary `service_providers` rows and are **not** touched.
  - Roll back code first, then the database (old code never reads the new tables, so the reverse order also works).

## After release (needs separate OK)
- Regenerate Supabase types so `vendor_listing_drafts` / `acquisition_spend` are typed.
- Change the automated "no listing yet" reminder link to `/become-a-vendor/start`.
- Customer-side source tracking (see customer strategy, gap 1).
