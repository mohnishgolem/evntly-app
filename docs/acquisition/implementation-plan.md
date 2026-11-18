# Vendor acquisition system: audit, tool review and implementation plan (18 Nov 2026)

Goal: 200 genuine registered vendors by 30 Nov 2026; immediate goal 20 completed listings.
Nothing in this plan sends, publishes, spends or deploys without Sai's per-item approval.

## 1. Audit: what already existed (reused, not rebuilt)

| Need | Already in Evntly | Gap closed by this branch |
|---|---|---|
| Lead tracking discovery → interested | `vendor_prospects` + `vendor_prospect_events` (DB-enforced consent, permanent do-not-contact, one follow-up ≥ 7 days, import dedupe vs prospects/waitlist/accounts/listings), Admin → Beta Vendors import + actions | Priority queue (`priority_queue.sql`, `lead-score.ts`), lead → vendor matching by email / Instagram / name, `record_event.sql` for confirmed events |
| Registration → completed listing | `beta_applications`, listing completion gate (PR #62), 24h/72h draft reminders, setup requests | One verified definition (`admin_verified_vendor_funnel()` + `verified_vendors.sql`) with test exclusion and per-email dedupe; stuck-vendor query |
| Attribution | `page_views.source`, `funnel_events` (admin activity excluded), `beta_applications.source/campaign`, source funnel table, Meta Pixel/CAPI | Meta judged on verified registrations / completed listings per A$ |
| Reporting | Daily acquisition email (cron 21:00 UTC), scheduled report task | Daily report skill with targets; live dashboard |
| Outreach | Gmail drafts, IG DMs by hand, approval files, Social Desk | Reusable drafter skill + compliance checklist; approval queue in the dashboard |

**Live numbers (production, 18 Nov 2026, test accounts excluded):** 13 verified vendor
registrations · 10 approved listings · 3 completed listings · 4 test accounts excluded ·
164 uncontacted prospects in the queue (29 email-ready, 39 Instagram, 1 phone, 95 with no
public contact route). Meta: A$63.30 spent → 1 verified registration, 0 completed.

**Main findings**
1. The bottleneck is sending, not finding: 28 personalised Gmail drafts from 3 Nov are
   still unsent, and 4 batch-3 Instagram drafts from 13 Nov were never sent.
2. One unsent Gmail draft goes to a vendor who declined (Platinum Dholis, do-not-contact). Delete it.
3. 7 of 10 approved vendors have empty listings; completing them is the cheapest win.
4. The in-app dashboard counted applications, so vendor accounts with no application
   (3) and admin-added listings (MB Photomedia) were invisible or mis-attributed, and QA
   accounts were excluded only by hand. Fixed by the verified funnel.
5. 200 by 30 Nov needs ~15 verified registrations a day vs ~1/day actual. Not reachable
   at current volume; the realistic lever is daily sending at the agreed caps plus completion.

## 2. Open-source tools and skills reviewed

| Candidate | Licence / maintenance | Security & platform fit | Verdict |
|---|---|---|---|
| coreyhaines31/marketingskills (prospecting, cold-email, referrals, onboarding…) | MIT, actively maintained | Already installed in `~/.claude/skills`; text-only skills, no code execution | **Keep using** as reference; Evntly skills encode our stricter rules (Spam Act, caps) |
| anthropics/skills (skill-creator) | Apache-2.0 (per skill) | Text + scripts; already available | Use skill-creator to iterate on these skills |
| ABN Lookup web services (ABR) | Free government API, GUID by email after accepting terms | Official, read-only, public data | **Recommend** (Sai registers GUID; store in env, never in repo) to verify active ABN + state |
| Google Places API (New) | Paid per SKU after free tier (Text Search Pro ~5,000 free calls/month per third-party sources; verify on Google's pricing page) | Official, ToS-compliant | Optional; needs Sai's cost approval and a billing account |
| Crawl4AI | Apache-2.0 | Generic crawler; robots.txt handling not confirmed | **Not installing**: our sources are low-volume manual reads; a crawler invites ToS breaches |
| Firecrawl | AGPL-3.0 server | Hosted version is paid; AGPL obligations if self-hosted and modified | **Not installing** |
| Twenty / EspoCRM | AGPL-3.0 | Separate DB + hosting to secure; duplicates `vendor_prospects` | **Not installing**: Supabase already is the CRM, with stronger DB rules |
| Instaloader / Phantombuster / IG automation | — | Breaches Instagram terms; account risk | **Rejected** |
| Apify ABN actors / list vendors | Commercial | Third-party handling of our queries; unnecessary vs free ABR API | **Rejected** |

Competitor directories (checked 18 Nov): Easy Weddings robots.txt allows public storefronts but
disallows `/reviews/supplier/`, enquiry, `/business/`, `/api/`; its terms page was not found at
`/terms`, so manual reading only. Event Heroes allows crawling but forbids training
(`/llms.txt`). Use both only as a signal and verify on the vendor's own site
(`evntly-competitor-scan`).

## 3. What this branch adds (`feat/acquisition-skills`)

- `.claude/skills/` (8 skills + README with hard rules): acquisition-truth, lead-finder,
  competitor-scan, outreach-drafter (templates + compliance), pipeline-tracker,
  listing-followup, meta-verified-roi, daily-acquisition-report.
- `supabase/migrations/20261120090000_admin_verified_vendor_funnel.sql` (+ rollback):
  read-only, `security definer`, `is_admin()` gated (admin + MFA), no table or data changes.
- Admin → Beta Vendors: "Verified vendors (test accounts excluded)" card with per-source
  table and the daily pace to 200. Shows an "apply migration" note until the migration is applied;
  the service-role cron skips the RPC.
- `src/lib/acquisition/lead-score.ts`, `test-accounts.ts`, `verified-funnel.ts`.
- Live dashboard (private artifact): live Supabase queries via Sai's connector, Meta spend file,
  approval queue stored in the artifact (editors only can approve).

## 4. Tests and security checks

- Unit: `tests/unit/acquisition-lead-score.test.ts` pins scoring, channels, test-account rules,
  stage logic, summary and pace maths (the SQL twins use the same numbers).
- DB (PGlite, offline): `tests/sql/admin-verified-vendor-funnel.test.ts`: genuine vs test
  split, per-email dedupe, completed rule, per-source counts; non-admin and admin without MFA get
  0 rows; anon gets permission denied; rollback removes the function.
- Full suite: 86 files / 764 tests pass; `tsc --noEmit` and eslint clean on changed files.
- Security review points: no new grants beyond `execute` to authenticated; `search_path = ''`;
  no PII leaves the DB in reports or the dashboard (no emails or phones in any query the page runs);
  skills forbid sending, scraping, automation and secrets in the repo; read-only SQL is kept
  apart from the single write template (`record_event.sql`), which only runs after Sai confirms.

## 5. Rollout (each step needs Sai's OK)

1. Open the PR for `feat/acquisition-skills` and run CI.
2. Apply the migration on a Supabase branch or in a rolled-back transaction, then in production.
3. Merge and deploy; check Admin → Beta Vendors shows 13 / 10 / 3 (or the current truth).
4. Daily (attended): the report skill, then sending what's approved in the queue within caps, then the tracker.
5. Weekly: lead-finder batch of ≤ 30 verified leads in the thinnest category; competitor scan monthly.
6. Ads: stay off until onboarding passes the real-inbox test and outreach has produced 5 more completed listings.

## 6. Daily targets (until 30 Nov)

| Activity | Target | Measured by |
|---|---|---|
| Instagram first DMs | 15/day (attended, approved) | queue file send log → `contacted` |
| Emails | up to 20/day from Gmail | Gmail Sent + tracker |
| Stuck-vendor nudges | each stuck vendor once per stage | listing-followup queue |
| Applications reviewed | same day | Admin → Approvals |
| **Outcome:** verified registrations | 15/day needed for 200; realistic 2–4/day | `verified_vendors.sql` |
| **Outcome:** completed listings | 20 total (17 to go) | `verified_vendors.sql` |
