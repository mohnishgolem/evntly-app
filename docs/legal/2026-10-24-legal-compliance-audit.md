# Evntly — Legal & Compliance Audit (pre-implementation)

**DRAFT — prepared to support legal drafting and technical implementation. Not legal advice. Requires review by a practising Australian solicitor before reliance.**

- Business: Sai Mohnish Golem trading as Evntly (ABN 49 193 658 959), sole trader, Sydney NSW
- Audited: 2026-10-24
- Scope: repo `~/evntly-app` (branch `prelaunch-sim-fixes` @ d447b63; `main` @ a23c986 is what's live), Supabase prod project `pzeosxtdulveuywhmkfe` (read-only queries + security advisors), live legal pages `/terms` and `/privacy-policy` (both "Last updated 20 October 2026").
- Method: read the code, migrations, RLS/storage policies, cron jobs and `app_settings`. Nothing was changed.

Severity: **Critical** = live now and likely misleading or unlawful; **High** = fix before launch; **Medium** = fix soon; **Low** = recommended.

---

## 1. Existing legal pages

| Document | Exists? | Notes |
|---|---|---|
| Terms & Conditions (`/terms`) | Yes, a single document for customers and vendors | 16 short sections. Correct legal name and ABN. NSW governing law. |
| Privacy Policy (`/privacy-policy`) | Yes | 14 sections. Lists processors, overseas disclosure, retention, OAIC complaint path. |
| Vendor Service Agreement | **No** | Vendor obligations are 6 sentences inside the Terms (s5). |
| Cancellation, Refund & Dispute Policy | **No** | Terms s6 says only that Evntly is "not responsible" for cancellations or disputes. |
| Fee schedule | **No** | — |
| Future payments framework | **No** | Yet payment code is deployed (see §5). |
| Cookie notice | Inside Privacy s8 | Accurate. Only essential cookies, plus Vercel Analytics (no cross-site cookies). |

Both pages are public, need no login, are linked from signup, and render server-side.

## 2. Missing clauses

**Terms (customer):** the quote → booking contract formation steps in detail; direct-payment risks and warnings; GST and price display (vendors' prices are GST-inclusive or exclusive?); cancellation, refund and rescheduling framework; an ACL consumer-guarantee statement for services (the current one is generic); limits on vendor verification (what "reviewed" actually checks); review rules (genuine reviews, no incentivised reviews); complaints and internal dispute process with timeframes; suspension grounds plus notice and appeal; a fair variation clause; a severability clause; a jurisdiction clause; a notices clause; the dispute feature (live in app, absent from Terms); the account-deletion process.

**Privacy Policy:** a statement of APP coverage or the small-business exemption position; automated vendor matching and the reliability score; automated **risk scoring** of users (`admin_risk_overview` signals: leakage, reports, blocks, quick cancels, disputes, shared ABN); dispute records; suspension records; admin audit logs; booking **event address** (collected, not mentioned — the policy mentions only suburb); "recently viewed vendors" (personalised use of page views); calendar feed tokens; IP-based rate limiting (only partly covered); retention for leakage logs, disputes, audit logs, match logs and risk reviews; the deletion process and its consequences; the data-breach response process; a marketing section (no marketing exists yet); a privacy-complaint timeframe (the OAIC expects about 30 days); the ADM transparency content that becomes mandatory from 10 Dec 2026 (see §6).

**Vendor:** independent-contractor status; eligibility; ABN, licences and insurance; advertising accuracy; service standards; direct-payment obligations; fees; GST and invoicing (Evntly generates vendor invoices); customer-data handling (vendors receive customer contact details after booking, so they need their own privacy obligations); IP licence for portfolio content; indemnity; termination.

## 3. Inaccurate legal claims (policy vs actual behaviour)

| # | Severity | Claim | Actual behaviour (evidence) |
|---|---|---|---|
| 3.1 | **Critical** | Terms s6: "Evntly does not currently process payments. Customers pay Vendors directly." | Every booking page on live `main` shows a **Payments** section with a shield icon and this text: *"Payments go to Evntly and are held until the work is approved, then released to the vendor."* (`src/components/payments/booking-payments.tsx:102`). It renders **even though `payments_enabled=false`**. Vendors can propose milestone plans and customers can "agree" (`propose_payment_plan` / `respond_to_payment_plan` RPCs have no `payments_enabled` check). The plan editor shows vendors "you get" after a **7% commission** (`commission_bps=700`). Event Board status text: "Paid to Evntly, held" (`src/lib/event-board.ts:334`). Vendor Profile hub links to "Payments & payouts" showing a "held" total. This is an escrow / payment-protection representation that contradicts the Terms, and an undisclosed fee. No money can move: checkout is blocked at `src/lib/payments/server.ts:253`, and the prod DB has 0 payment plans. |
| 3.2 | **High** | Privacy s2: page views are "anonymous… tied to a random ID stored in your browser rather than to you." | `/api/track` stores `user_id` for signed-in users (108 rows in prod), and `/dashboard` uses it to show "recently viewed vendors" (`src/app/dashboard/page.tsx:29`). This is personal information used for personalisation. |
| 3.3 | High | Privacy s3 says "Match Customers with Vendors" (generic). | Smart matching is a weighted automated score (suitability 30, budget 25, quality, etc.), plus a nightly vendor **reliability** score and logged `match_runs`. Risk scoring of users is also automated. Neither is disclosed. **No AI or LLM is used anywhere** (no AI SDKs; OCR is self-hosted Tesseract). The policies must not claim AI processing. |
| 3.4 | Medium | Terms s13: "ask us to close your account at any time." | There is no deletion feature, no documented process, and no defined effect on bookings, reviews or messages. Email only. |
| 3.5 | Medium | Privacy s5: other party sees "your name". | After booking, both sides also see email and phone (unmasked) and the event address. This is correct behaviour but under-described. |
| 3.6 | Medium | Terms s12: "provided 'as is'". | An "as is" statement next to ACL guarantees risks misleading consumers about their rights (ACL s29(1)(m)). Reword. |
| 3.7 | Medium | Terms s14: continued use means acceptance of changes. | The app does force re-acceptance on a version bump (`TermsGate`), which is better than the clause says. The clause itself is a UCT risk (§6). |
| 3.8 | Low | Dispute panel: "Evntly aims to respond within 3 business days." | This is a service commitment not written down anywhere. Confirm the timeframe or remove the text. |
| 3.9 | Low | Admin dispute outcomes are labelled `customer_favour` / `vendor_favour`. | With direct payments Evntly cannot enforce an outcome. The policy must frame disputes as facilitation, not adjudication. Admin note placeholder: "refunds are handled on the Payments page" — no refunds are possible today. |

Claims that check out against the code: contact masking before booking (DB-enforced); attachment OCR held back on our own servers; payment-talk messages flagged only (`payment_guard_mode=log`); quote 7-day expiries; reviews only from completed bookings, with ratings computed only from them; sample listings badged and uncontactable; processors list (Supabase Sydney, Vercel syd1, Resend, Photon, OpenFreeMap, Unsplash, Google, push services); retention of errors 30 d / page views about 13 months / rate-limit counters 2 d (cron jobs exist); admin TOTP; Apple sign-in hidden.

## 4. Privacy risks

1. **Personalised page views** described as anonymous (3.2). Fix the policy, or drop `user_id` linkage for non-admins. The recommendation is to keep the feature and disclose it.
2. **Undisclosed automated profiling**: risk scoring and reliability scores. Disclose them, and give a way to contest (admin review is already flag-only, which helps).
3. **No deletion or export workflow.** APP 12/13 access and correction need a process. Deletion isn't an APP right but is promised in the policy.
4. **Retention gaps**: `leakage_events`, `admin_audit_log`, `match_runs`, `risk_reviews`, disputes, and messages have no retention limits. APP 11.2 requires destroying or de-identifying information once it's no longer needed.
5. **Vendors receive customer contact details** after booking, with no contractual privacy obligation on the vendor. This belongs in the Vendor Agreement.
6. **Event address** collected and not disclosed.
7. **Secrets in DB**: `app_settings` holds the VAPID private key and the cron secret in plaintext. The table is service-role only (verified: no anon or authenticated grants), so exposure needs a service-role compromise. Recommend Supabase Vault (Low).
8. **Privacy Act coverage**: a sole trader under $3m turnover is usually exempt *unless* an exception applies, such as trading in personal information. The policy currently states APP compliance. Treat Evntly as bound (recommended), and confirm with a solicitor (or opt in under s6EA).

## 5. Booking & payment risks

1. **Critical — escrow representation while payments are off (3.1).** Recommended immediate fix: hide the whole Payments section, the payouts link, the "held" labels and the plan RPCs unless `payments_enabled=true`. Replace them with a neutral note: *"Pay the vendor directly using the details they give you. Evntly doesn't take or hold payments."* This is a UI and copy change plus one guard in the RPCs. The payment code itself is untouched, and nothing financial changes.
2. The planned future model ("Evntly holds funds until approval", separate charges and transfers) may involve a **non-cash payment facility / financial service** under the Corporations Act, and the Treasury payments-licensing reforms are pending. Get specific advice before activation (see Framework E).
3. **Direct-payment scam risk**: customers pay vendor bank details given in chat. The Terms and UI should warn about this (verify details by phone; Evntly never asks you to pay it).
4. Vendor `cancellation_terms` and `deposit` fields exist on quotes and listings. The Cancellation Policy can lean on these: "the vendor's stated terms apply, subject to the ACL". Good.
5. Booking acceptance: `accept_quote` creates the booking immediately. The Terms must say plainly that acceptance forms a contract with the vendor.

## 6. Unfair contract terms (UCT) risks

The UCT regime (ACL Pt 2-3; penalties since 9 Nov 2023) applies to standard-form **consumer** contracts (the customer Terms) and **small business** contracts (the vendor terms — most vendors will have fewer than 100 employees or turnover under $10m).

| Current term | Risk | Recommended approach |
|---|---|---|
| s14 unilateral change + deemed acceptance | High | Give notice, keep material changes non-retrospective, give a right to terminate, and require re-acceptance (already built). |
| s13 "may suspend or close an account that breaches" | Medium | List grounds, give notice where practicable, allow a response, and keep immediate suspension for serious or urgent cases only. |
| s12 broad liability exclusion | Medium | Keep the ACL carve-out, make it reciprocal and proportionate, and limit it to loss Evntly didn't cause. |
| s11 licence to "promote the service" (unlimited) | Low–Med | Define scope, make it end on deletion except for archival and legal copies, and cover vendor portfolios specifically. |
| (future) vendor indemnity | Med | Make it proportionate: only to the extent caused by the vendor. |

## 7. Required code changes (proposed — not started)

1. **Payments UI gating** (Critical, 5.1) — hide the payment UI and copy when payments are disabled; guard the plan RPCs. *Needs your explicit OK because it touches payment-related screens. No money flow changes.*
2. **Legal pages**: `/terms` (customer), `/privacy-policy`, new `/vendor-agreement`, new `/cancellation-refund-dispute-policy`, a `/legal` index, and footer links. All public, using the shared layout and the existing design tokens. Draft banner on each.
3. **Consent records** — new append-only table `legal_acceptances` (user_id, document, version, accepted_at server time, context, consent status, nullable user_agent; **no IP** unless you want it). RLS: users read their own rows; inserts only through security-definer RPCs; no updates or deletes; admin read. Keep `users.terms_version` as a cache so `TermsGate` keeps working. Migration plus rollback script; additive only.
4. **Signup**: separate required Terms checkbox (customer Terms, or customer Terms plus Vendor Agreement for vendors) + Privacy notice text + **separate optional marketing checkbox, unticked**. Google sign-in gets the same choices through the post-sign-in gate.
5. **Vendor onboarding**: required Vendor Agreement + fee-schedule acceptance on the final wizard step, recorded with context `vendor_onboarding`, and enforced server-side in `submitVendorListing` and in the DB (listing insert requires a current vendor acceptance).
6. **Server-side enforcement**: today `TermsGate` is a client overlay only, so server actions and RPCs work without acceptance. Add a DB-level check on key writes (quote requests, messages, bookings, listings) or, at minimum, in the server actions.
7. **Marketing preference**: stored as a consent row and shown in notification settings (withdrawable). No marketing emails are sent today. Spam Act unsubscribe is required before any are sent.
8. **Account deletion request**: a "Delete my account" request flow in Profile that creates a request row and emails admins. Hard deletion stays a manual admin action until a retention rule is agreed (bookings and disputes may need keeping).
9. **Privacy accuracy fixes**: page-view disclosure; matching and risk-scoring disclosure.
10. **Retention**: add prune jobs only after you confirm the periods.

Not in scope unless you ask: account-suspension UI (DB part already live from `gaps-wip`), the dispute-evidence bucket (migration written but not applied).

## 8. Issues needing solicitor review

1. Privacy Act coverage (small-business exemption versus the "trading in personal information" exception; whether to opt in under s6EA).
2. Future held-funds model: Corporations Act non-cash payment facility, ASIC relief, the Treasury payments-licensing reform, Stripe Connect role allocation, and AML/CTF (likely not, but confirm).
3. Whether Evntly is "supplying services" to consumers itself (platform services → its own ACL consumer guarantees), and the liability cap that's permissible.
4. UCT review of the final customer Terms and the Vendor Agreement.
5. Vendor indemnity and insurance minimums.
6. Dispute process wording, so Evntly isn't taken to be an adjudicator or guarantor.
7. Vendor-issued invoice generation (tax invoice requirements; Evntly not the supplier).
8. ADM transparency obligations (APP 1.7–1.9, from 10 Dec 2026) as applied to matching and risk scoring.
9. Commission or subscription fees, and GST registration of Evntly itself.
10. Wording of the scam/off-platform payment warning, and the business-records retention periods (e.g. 5 years for tax records).

---

## Legal framework assessed (requirement vs recommendation)

| Law / regulator | Applies? | Requirement (must) | Recommendation (should) |
|---|---|---|---|
| Australian Consumer Law (Sch 2, *Competition and Consumer Act 2010*) | Yes | No misleading conduct (s18) or false representations incl. about consumer rights (s29(1)(m)); consumer guarantees for services (ss60–62) can't be excluded (s64); UCT (Pt 2-3) | Plain-English guarantee statement; avoid "as is"; label sample listings (done) |
| ACCC fake-review guidance | Yes | No fake or incentivised reviews; don't suppress negative ones | Publish the review policy |
| *Privacy Act 1988* + APPs | Likely (see 8.1) | If bound: APP 1 policy, APP 5 notice, APP 8 cross-border, APP 11 security and retention, APP 12/13 access and correction | Comply regardless |
| Privacy and Other Legislation Amendment Act 2024 | Yes (tort); APP ADM if bound | ADM disclosure in the privacy policy from **10 Dec 2026**; statutory tort for serious invasions of privacy (in force 2025) | Disclose matching and risk scoring now |
| Notifiable Data Breaches scheme (Pt IIIC) | If an APP entity | Assess within 30 days; notify the OAIC and individuals for eligible breaches | Written breach response plan |
| *Spam Act 2003* | Yes | Commercial emails need consent, sender ID and a working unsubscribe | Transactional emails stay transactional; separate opt-in |
| *Electronic Transactions Act 1999* (Cth) / *2000* (NSW) | Yes | Electronic acceptance valid if the method reliably identifies the person and intent | Keep versioned acceptance records with timestamp |
| ASIC Act / Corporations Act (financial services) | Not at launch | — | Advice before holding funds (Framework E) |
| NSW Fair Trading (*Fair Trading Act 1987* applies the ACL in NSW) | Yes | As per ACL | Complaint path refers to NSW Fair Trading |
| GST (*A New Tax System (GST) Act 1999*) | Depends on registration | Tax-invoice content if registered | Confirm Evntly's GST status |

Primary sources to cite in the final drafts (to be re-checked for current versions at drafting time; they were not fetched during this read-only audit):
- ACCC — Consumer guarantees: https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees
- ACCC — Unfair contract terms: https://www.accc.gov.au/business/business-rights-and-protections/unfair-contract-terms
- ACCC — Online reviews: https://www.accc.gov.au/business/advertising-and-promoting-your-business/online-reviews
- OAIC — Australian Privacy Principles: https://www.oaic.gov.au/privacy/australian-privacy-principles
- OAIC — Small business: https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/small-business
- OAIC — Notifiable Data Breaches: https://www.oaic.gov.au/privacy/notifiable-data-breaches
- ACMA — Spam: https://www.acma.gov.au/avoid-sending-spam
- Federal Register of Legislation (CCA 2010, Privacy Act 1988, Spam Act 2003, ETA 1999): https://www.legislation.gov.au
- NSW legislation (Fair Trading Act 1987, Electronic Transactions Act 2000): https://legislation.nsw.gov.au
- ASIC — Non-cash payment facilities (RG 185): https://asic.gov.au
- NSW Fair Trading: https://www.fairtrading.nsw.gov.au

## Security & privacy verification (summary)

- RLS enabled on **every** public table (verified). 12 tables have RLS with no policies; these are intentional service-role-only tables (incl. `app_settings`, `page_views`, `risk_reviews`, `vendor_payout_details`).
- Security advisors: 3 anon-executable security-definer helpers (`is_admin`, `owns_service_provider`, `is_active_combined_package`) used inside RLS (known and intentional, return booleans only); 40 authenticated security-definer RPCs, which is the app's designed API surface (each checks `auth.uid()`).
- Storage: `message-attachments` and `milestone-evidence` private with party-scoped policies; `portfolio` public-read with owner-only write and delete.
- Admin role requires TOTP (aal2); admin changes audit-logged; role escalation blocked by trigger.
- Acceptance records: **12 of 15 users have no recorded Terms acceptance** (they'll be prompted at next sign-in). The recording is a single overwritable column with no history, document type or context. The acceptance gate is client-side only (finding 7.6). Unused legacy columns exist: `users.vendor_agreement_version` / `vendor_agreement_accepted_at`.
- No account suspension UI (DB function live); no deletion; no data export.

## Outstanding business decisions (needed before drafting finalises)

1. **Fees at launch**: is listing free for vendors at launch? Any subscription (strategy doc: Pro $39 / Business $79)? The 7% in the DB is for future payments only, so the fee schedule will be a placeholder unless you confirm.
2. **Hide payments UI now?** (Critical 5.1) — recommended yes.
3. **Privacy Act stance**: treat Evntly as bound by the APPs (recommended)?
4. **Dispute response timeframe**: keep "3 business days"?
5. **Vendor requirements**: ABN mandatory at listing? Public liability insurance required (minimum amount) or just recommended?
6. **Retention periods**: messages, bookings and disputes after account closure (proposal: 7 years for booking and transaction records, 2 years for messages, delete the rest within 30 days of a deletion request).
7. **Marketing**: any plans to send marketing emails? (A consent checkbox will be built either way, unticked.)
8. **Postal address** for privacy complaints (email only is acceptable; a PO box is optional).
9. **Evntly's own GST registration** status.
10. **Base branch**: build on `prelaunch-sim-fixes` (5 commits ahead of `main`, not merged) or on `main`?
