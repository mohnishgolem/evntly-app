# PR #43 (meta-v2-funnel) deploy checklist

Prepared 14 Nov 2026. Steps 1–3 were done in production on 14 Nov with Sai's approval; each step still marked 🔒 needs Sai's separate approval.

Checked at commit `3851a14` (PR head, up to date with `main` `cedd412`):
- `vitest`: 70 files, 632 tests pass. `tsc --noEmit` clean. Lint clean. GitHub CI all green (test-and-build, dependency-audit, secret-scan, sast, Vercel preview).
- Live database (read-only queries, 14 Nov): `funnel_events_event_check` still allows only claim_click / signup_attempt / signup_error / account_created; `page_views.source`, `vendor_waitlist.wants_help` and `vendor_waitlist.instagram` don't exist; `admin_funnel` ends at step 114 and its body matches the rollback's copy exactly. Grants: authenticated, service_role (not anon). Rows today: funnel_events 8 (claim_click 2, signup_attempt 3, account_created 3), vendor_waitlist 18.

## 0. Before you start
- [x] Backed up the live "Confirm signup" template (14 Nov) to `docs/launch/supabase-confirm-signup-template.backup.html`. It is Supabase's default (subject "Confirm your email address", link only), so there was no custom branding to merge.
- [x] Read the auth settings (14 Nov, no changes made): Confirm email on; Email OTP length **8**, expiry **3600 s** (1 hour). The form accepts 6–10 digits, so 8 works with no code change. Custom SMTP is on (sender "Evntly", hello@evntlyapp.com). Auth email limit **30 emails/hour** for the whole project, 60 s between resends per user. Leaked-password protection on.
- Capacity note: 30 emails/hour covers sign-ups plus resends. At the planned A$30/day that's far above expected volume; raise it under Authentication → Rate Limits only if sign-ups ever queue.
- [ ] Pick a quiet time (no Meta ads are running; all three V2 ads are drafts).

## 1. ✅ Apply the migration (done 14 Nov 2026, approved by Sai; recorded in prod as `20261114101549 meta_v2_funnel`)
Verified after: event check has 6 values, `page_views.source` / `vendor_waitlist.wants_help` (default false) / `vendor_waitlist.instagram` exist with their checks, `admin_funnel` has steps 115–116, grants authenticated/postgres/service_role (no anon), row counts unchanged (funnel_events 8, vendor_waitlist 18, page_views 851). Live site pages return 200. Security advisor: no new findings.

`supabase/migrations/20261115090000_meta_v2_funnel.sql`
- Additive only: one nullable column (`page_views.source`), one defaulted column (`vendor_waitlist.wants_help`, default false) and one nullable column (`vendor_waitlist.instagram`), with check constraints; `funnel_events_event_check` widened (existing rows all pass); `admin_funnel` re-created with steps 115–116 (grants are kept by `create or replace`).
- Fast: no table rewrite (adding a column with a constant default is metadata-only in Postgres 11+), tables are tiny.
- Verify afterwards:
  ```sql
  select pg_get_constraintdef(oid) from pg_constraint where conname = 'funnel_events_event_check';
  select column_name from information_schema.columns where table_schema='public' and table_name in ('page_views','vendor_waitlist') and column_name in ('source','wants_help','instagram');
  ```
  Then open Admin → Founding funnel and check steps 115 and 116 appear (both 0).

**Why first:** the new code inserts `wants_help`/`instagram` for "Prefer some help?" requests and the two new funnel events. Before the migration those inserts fail (the help form shows an error; funnel events are caught and only logged). Admin pages read the waitlist with `select("*")`, so they work in either order.

## 2. ✅ Update the "Confirm signup" email template (done 14 Nov 2026, approved by Sai)
Verified after reload: subject "Confirm your Evntly account", body 471 characters matching `supabase-confirm-signup-template.html` (code line and confirmation link both present).

- Paste `docs/launch/supabase-confirm-signup-template.html` and change the subject to "Confirm your Evntly account". Rollback: paste the backup file and subject back. It keeps `{{ .ConfirmationURL }}`, so the link keeps working for everyone.
- Safe before the code deploy: today's sign-up page ignores the code, and people can still use the link.

## 3. ✅ Merge PR #43 and let Vercel deploy production (done 14 Nov 2026, approved by Sai)
Merged at reviewed head 3851a14 as merge commit c17e8f0; Vercel production deployment DUmbos8cmnrwoYaSZcGHyh7DLp7R Ready. Smoke test: /, /founding-vendors, ?cat=photographer (variant headline shows), /signup?role=vendor, /login, /explore, /privacy-policy all 200; "Prefer some help?" and the new privacy paragraph are live; /api/track 204. Vercel runtime errors: none in the 30 min after deploy. Branch meta-v2-funnel kept; PR #42 retargeted to main.

- Watch the Vercel deployment until Ready; check `get_runtime_errors` for 15 minutes.
- Smoke test without creating an account: load `/founding-vendors?cat=photographer` (headline matches the photographer ad) and `/signup?role=vendor` (form loads).

## 4. 🔒 Throwaway vendor sign-ups (create real accounts)
Status 14 Nov:
- ✅ **Google sign-up inside Instagram** (10:33–10:35 UTC): claim tap → sign-up form → account → claim page signed in, all credited to `meta_ads`. Test account deleted afterwards (its 6 `legal_consents` rows stay: append-only by design). Test funnel events ids 12–16 identified (see the launch report) and left in place pending approval to delete.
- ⏳ **Email + password + 8-digit code inside Instagram**: not yet run. Instagram's browser must be signed out of Evntly first (an admin session sends Claim to the claim page instead of sign-up).

Steps for the email test:
- On an iPhone, open a tagged link inside Instagram (`…/founding-vendors?utm_source=meta&utm_medium=paid_social&utm_campaign=fv_v2_nov26&utm_content=lead_form_v2`), tap Claim, sign up as a vendor with a test inbox.
- Expect: the email shows the code and the link; typing the code lands you on the claim page signed in, inside Instagram's browser.
- Check: `admin_funnel` steps 110, 111, 113, 115, 116 each +1, and the latest `funnel_events` row is `email_confirmed` with detail `code`.
- Delete the test account afterwards (Admin or Supabase Auth).

## 5. Then (separately) PR #42
#42 already targets `main` (retargeted 14 Nov) and now also clears stale campaign cookies. Apply `20261113090000_founding_campaign_tags.sql` (new `campaign` columns only; no overlap with this migration), then merge. Each step 🔒.

## 6. PR #44 (landing view source)
Code only. Fixes the first founding page view being credited to a stale or missing source. Merge 🔒 any time; merges cleanly with #42.

## Rollback
Choose by what broke:

| Problem | Do this |
|---|---|
| Code emails broken / people confused by the code | Restore the backed-up template (link-only). The code box shows but the link still works. |
| Site error after deploy | Vercel → Deployments → promote the previous production deployment (instant). The migration can stay: old code ignores the new columns and events. |
| Migration itself must go | **Roll back the code first** (above), then run `supabase/rollbacks/20261115090000_meta_v2_funnel.down.sql`. It deletes `signup_view`/`email_confirmed` events, drops `page_views.source` and the two waitlist columns (any help requests' Instagram/website text is lost; export Admin → Beta vendors CSV first), and restores today's `admin_funnel` (verified identical to the live copy on 14 Nov). |

Order matters: if the columns are dropped while the new code is live, "Prefer some help?" submissions fail.

## Privacy policy
See the recommendation in the 14 Nov report: no `LEGAL_VERSIONS.privacy_policy` bump.
