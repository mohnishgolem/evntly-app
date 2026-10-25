# Evntly — Legal Compliance Implementation Report

**DRAFT. Legal drafting and technical implementation support, not legal advice. All documents require final approval by a practising Australian solicitor. Generating these documents does not make the business legally compliant.**

Branch: `legal-compliance` (from `main` @ a23c986). Not committed or pushed. Database migrations: written, **not applied**.

## Deliverables

| # | Deliverable | Where |
|---|---|---|
| 1 | Australian legal compliance audit | `docs/legal/2026-10-24-legal-compliance-audit.md` |
| 2 | Four launch-ready draft policies | `/terms`, `/privacy-policy`, `/cancellation-refund-dispute-policy`, `/vendor-agreement` (source: `src/lib/legal/documents/*.ts`; Markdown copies in `docs/legal/*.md`, regenerate with `npx vite-node --config vitest.config.mts scripts/export-legal-docs.ts`) |
| 3 | Future milestone-payment framework (inactive) | `docs/legal/future-milestone-payments-framework.md` |
| 4 | Legal pages in Evntly | 4 documents + `/legal` index; footer, profile, sitemap links; public (no login) |
| 5 | Acceptance flows | Signup (customer + vendor), Google/existing-user gate (`<LegalGate>`), vendor listing wizard "Agreement" step |
| 6 | Consent & version records | `legal_document_versions`, append-only `legal_consents` (migration `20261029090000`) |
| 7 | Security & privacy findings | Below + audit report |
| 8 | Testing results | Below |
| 9 | Outstanding business decisions | Below |
| 10 | Solicitor review checklist | Below |

## What changed in the app

**Payments (critical fix).** Booking pages no longer show "Payments go to Evntly and are held…" while payments are off. They show a direct-payment notice with a scam warning and a link to the policy. Also:
- the payouts page and the profile hub now say customers pay vendors directly;
- the Event Board label reads "Pay the vendor directly";
- "Booking & payments" is renamed "View booking";
- a DB trigger blocks payment plans while `payments_enabled` is false.

No Stripe or money-flow code was changed.

**Signup** has separate, unticked choices:
- required: the Terms and the Cancellation Policy, with an 18+ confirmation;
- required for vendors: the Vendor Service Agreement and fee schedule;
- a Privacy Policy notice (not a checkbox);
- optional marketing consent.

The server validates all of these and records them through the service role. Acceptance is no longer read from client-controlled auth metadata.

**Gate.** Any signed-in user missing a current required document gets a modal listing the documents, with a required tick, plus the marketing choice if they've never been asked. It replaces the old `TermsGate`.

**Vendor onboarding.** A new final "Agreement" step:
- **ABN is required** and checksum-validated, both client- and server-side;
- a GST tick;
- a plain-English list of obligations;
- a required agreement tick.

Acceptance is recorded before the listing insert.

**Settings → Privacy & legal** shows:
- the marketing on/off switch (each change is a consent record);
- the documents accepted, with version and time;
- an access/correction contact;
- **Delete account** (request flow, with cancel).

Admins see pending requests on `/admin/customers` and get an email. Deletion itself is completed manually.

**Database enforcement** (migration `20261029090100`, apply after deploy):
- new quote requests, messages and bookings need the current user documents;
- new listings and event applications also need the Vendor Agreement and fee schedule;
- admins and the service role are exempt.

The app maps the error to "Please accept Evntly's updated Terms…".

## Deployment order (important)

1. Apply `20261029090000_legal_consents.sql`. It is additive and backward compatible with the live app; the old signup metadata and `accept_terms()` keep working. It also blocks payment-plan creation immediately, which is intended.
2. Deploy the `legal-compliance` branch. Everyone, including the 15 existing users, will be asked to accept the 2026-10-24 documents on their next visit.
3. Apply `20261029090100_legal_enforcement.sql`. This turns on DB enforcement, removes the metadata path and revokes `accept_terms()`.
4. Run `supabase/tests/legal_consents_regression.body.sql` (pattern: both migration files, then `do $$ <body> $$;`). The final `raise` rolls everything back. Expect every line to start with `ok`.

Rollbacks: `supabase/rollbacks/20261029090100_legal_enforcement_down.sql` first, then `..._legal_consents_down.sql`. The second one drops the consent audit trail, so export it first.

## Testing results

| Area | Result |
|---|---|
| Type check (`tsc --noEmit`) | Pass |
| Lint (`eslint src tests scripts`) | Pass |
| Unit tests | **339/339 pass** (16 new) |
| Production build (`next build`) | Pass |
| New: signup consent (real supabase-js client, faked network) | Refuses without the Terms box; vendors need the Agreement; consent recorded via service role with `p_marketing=false` by default; no `terms_version` in auth metadata |
| New: later acceptance | Rejects unknown documents and the `signup` context; de-duplicates; marketing recorded only when asked |
| New: vendor onboarding | Invalid ABN / no agreement → nothing written; agreement recorded **before** the listing insert |
| New: document invariants | Page versions = DB migration versions; correct sole-trader name, no "Pty Ltd"; escrow/protection wording only as denials; ACL non-exclusion present; no AI claim; fees $0 and no % rate invented |
| Public page access (logged out) | `/terms`, `/privacy-policy`, `/vendor-agreement`, `/cancellation-refund-dispute-policy`, `/legal`, `/signup`, `/vendor-signup` all 200, draft banner shown |
| Mobile (375px) / desktop | No horizontal overflow; checked dark and desktop; anchors land below the sticky header; no console or server errors |
| Signup bypass (browser) | With required boxes unticked, the browser sends no request (verified in network log); the server also rejects (unit tests) |
| Accessibility | Checkboxes now have accessible names (`aria-labelledby`); fieldset/legend; 44px targets on new controls |
| **DB regression (RLS, append-only, enforcement, payment guard)** | **NOT RUN.** Executing the migrations inside a rolled-back transaction on production was blocked by the auto-mode permission check. A first attempt failed before any test ran (type error, fixed) and was confirmed rolled back. Needs a run by Sai or approval. |
| Existing booking flows | Unit tests for quotes, bookings, disputes, event board and matching pass. Logged-in flows (booking page notice, gate, wizard final step, settings pages) not exercised in a browser, because there are no test credentials for this session. |

## Security & privacy findings (summary)

| Severity | Finding | Status |
|---|---|---|
| Critical | Escrow / "held by Evntly" claims and an undisclosed 7% commission shown on live booking pages while payments are off | **Fixed in branch** (UI hidden + DB guard) |
| High | Acceptance gate was client-side only; API calls worked without acceptance | **Fixed in branch** (DB enforcement migration) |
| High | Acceptance recorded from client-controlled signup metadata; single overwritable column, no history | **Fixed in branch** (service-role recording, append-only table) |
| High | Privacy Policy said page views were anonymous; signed-in views are linked to accounts | **Fixed** (disclosed) |
| High | Automated matching and risk scoring undisclosed (ADM transparency mandatory from 10 Dec 2026) | **Fixed** (Privacy s4) |
| Medium | No account deletion process | **Partly fixed** (request flow; deletion still manual) |
| Medium | No retention limits for leakage logs, audit logs, match runs, risk reviews, disputes, messages | **Open:** needs periods decided, then prune jobs |
| Medium | Error reports store user ID (undisclosed) | **Fixed** (disclosed) |
| Low | VAPID private key and cron secret stored in `app_settings` (service-role only) | **Open:** move to Supabase Vault |
| Info | RLS on every table; storage policies party-scoped; admin requires TOTP; advisor warnings are the known intentional ones | No change |

## Outstanding business decisions

Shown as "To be confirmed" placeholders on the pages:

1. Retention periods after account closure: booking/transaction records, messages, consent records, safety records.
2. A liability cap for the customer Terms and for vendors, or none.
3. Vendor response time for disputes (drafted as 5 business days).
4. Privacy Act position: required to comply, or choosing to / opting in.

Built into the drafts; please confirm:

5. Complaint timeframes: acknowledge in 3 business days, respond in 30 days.
6. Notice periods: 14 days (customers) and 30 days (vendors) for material changes; 30 days for fees.
7. 90-day window to raise a problem after the event (matches the existing code).
8. Insurance recommended, not required (as you chose).
9. "We'll email you when your account has been deleted": this is a manual commitment.
10. Whether to keep the self-declared "18 or older" checkbox wording or add an age check.

Other open items:

11. Postal address for privacy complaints (optional).
12. Evntly's own GST registration status.

## Solicitor review checklist

- [ ] Privacy Act coverage (small-business exemption; "trading in personal information"; s6EA opt-in)
- [ ] Whether Evntly itself supplies services to consumers (free platform) and the resulting ACL guarantees; liability-cap wording
- [ ] UCT review: variation (s17 Terms / s16 Vendor Agreement), suspension (s15 / s14), liability (s14 / s13), IP licences, vendor indemnity (proportionate)
- [ ] Cancellation policy: deposits and "genuine pre-estimate" language; no-show treatment; what Evntly can and can't do in disputes
- [ ] Direct-payment and scam warnings: wording, and whether the platform has duties under the Scams Prevention Framework (designated sectors)
- [ ] Vendor-issued invoices generated by Evntly (tax invoice requirements; Evntly not the supplier)
- [ ] Sharing Economy Reporting Regime: is Evntly a reporting platform even with direct payments? (with accountant)
- [ ] ADM disclosure (APP 1.7–1.9 from 10 Dec 2026): matching, quote expiry, risk signals
- [ ] Overseas disclosure list and the APP 8 approach
- [ ] Spam Act: marketing consent wording; transactional vs commercial emails
- [ ] Electronic acceptance and record-keeping approach (ETA 1999 Cth / ETA 2000 NSW)
- [ ] Future payments: everything in section 9 of the payments framework
- [ ] Remove the "Draft" banners (`LEGAL_DRAFT` in `src/lib/legal/versions.ts`) only after sign-off

## Sources consulted (official)

- OAIC — APP 1.7–1.9 automated decision-making transparency (in force 10 Dec 2026): https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-1-app-1-open-and-transparent-management-of-personal-information
- OAIC — Small business and the Privacy Act ($3m threshold; trading in personal information; opt-in): https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business
- ACCC — Unfair contract terms reforms from 9 Nov 2023 (penalties; small business < 100 employees or < $10m turnover): https://www.accc.gov.au/media-release/accc-welcomes-new-penalties-and-expansion-of-the-unfair-contract-terms-laws
- ASIC — UCT reforms commence: https://www.asic.gov.au/about-asic/news-centre/news-items/unfair-contract-terms-reforms-commence
- ACMA — Spam Act consent and unsubscribe rules (5 working days): https://www.acma.gov.au/sites/default/files/2024-05/Fact%20sheet%20-%20email%20and%20SMS%20unsubscribe%20rules.pdf
- Treasury — Payments System Modernisation (PSP licensing): https://ministers.treasury.gov.au/ministers/daniel-mulino-2025/media-releases/new-legislation-modernise-regulation-payment-service and https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/bd/bd2526/26bd009
- ACCC consumer guarantees, NSW Fair Trading, NCAT, legislation.gov.au and legislation.nsw.gov.au: cited in the documents; re-check the current versions at solicitor review.
