# Vendor acquisition journey — implementation report

**24 Nov 2026 · branch `feat/vendor-acquisition-journey` · draft PR**
**Status: not merged, not deployed, migration NOT applied. No vendor data changed, no vendor contacted, no ad changed.**

Read with: [conversion analysis](2026-11-24-conversion-analysis.md) · [founder-led strategy](2026-11-24-founder-led-strategy.md).

---

## What's new

| # | Requirement | What was built | Where |
|---|---|---|---|
| 1 | Opportunity-focused landing | `/become-a-vendor`: leads with the customer-side opportunity and what a vendor gets; requirements in a plain "Pricing, eligibility and checks" section, asked only at save | `src/app/become-a-vendor/page.tsx` |
| 2 | Airbnb-inspired mobile, coral system | Existing tokens only (`--gradient-coral`, `surface-raised`, `btn-raised`, `text-eyebrow`); thumb-reach sticky bars above the tab bar; full-screen question flow | `src/components/vendor-journey/*` |
| 3 | Revenue scenario calculator | Vendor's own price × extra bookings they choose; Evntly's only input is today's $0 fee. Labelled "Hypothetical scenario… isn't a forecast… enquiries are only just starting" | `scenario-calculator.tsx`, `lib/vendor-journey/scenario.ts` |
| 4 | Start before an account | `/become-a-vendor/start` — no sign-in; account only at "Save my listing" | `listing-builder.tsx` |
| 5 | One question per screen | 5 required (category, name, suburb, events, pricing) + 2 optional (about, packages) + preview | `BUILDER_STEPS` in `lib/vendor-journey/draft.ts` |
| 6 | Auto-save + secure recovery | Every keystroke kept on device; private server copy after Q2 behind a 256-bit token in an **httpOnly** cookie (only its SHA-256 stored); "Email me a link" rotates the token; resume route strips the token from the URL; 30-day expiry + daily purge | `lib/vendor-journey/server.ts`, `actions/vendor-journey.ts`, `resume/[token]/route.ts` |
| 7 | Live preview | Mirrors the public profile from the vendor's answers only; side panel on desktop, bottom sheet on phones; "Private preview" label | `listing-preview.tsx` |
| 8 | AI-assisted description + packages | "Suggest a description" from the vendor's own notes; built-in writer by default (no outside service), Claude (`claude-opus-5-5`, structured JSON, refusal fallback) only if `ANTHROPIC_API_KEY` is set. Both may use only the vendor's facts. Starter packages never carry a price; vendor sets it and ticks "Add to my listing" | `lib/vendor-journey/assist.ts` |
| 9 | Free assisted onboarding | "Set it up with me" in the hero and a dedicated section (existing assisted waitlist form, reworded as personal service) | landing `#help` |
| 10 | Admin-assisted drafts with permission | Admin → **Vendor drafts**: admin + MFA; must record owner email, how/when permission was given and tick a confirmation (DB check enforces it); claim link shown once, **never sent automatically**; new link / mark sent / revoke | `app/admin/vendor-drafts`, `actions/admin-vendor-drafts.ts` |
| 11 | Secure claim link | `/become-a-vendor/claim/[token]`: noindex, no-referrer, private preview → "Review and edit"; **only the verified email the owner gave can save it**; ABN + agreement as usual; optional "add the photos I sent you" opens a Setup request | `claim/[token]/page.tsx`, `pendingDraftFor` |
| 12 | Transparent pricing, eligibility, verification | Fee wording reused from `vendor-terms.ts` (pinned to the Vendor Service Agreement by existing tests) | landing |
| 13 | Genuine profiles + social proof | Only real, complete listings (`getProofListings`) and the live count (≥ 5); the hero example is labelled "Not a real business". No testimonials invented | landing |
| 14 | Full funnel tracking | 13 new anonymous funnel events + 2 page kinds; `admin_vendor_journey_funnel()` from visit → started → preview → draft → verified account → listing → submitted → approved → completed → **genuine enquiry**, plus all approved genuine vendors and how many got an enquiry | migration, `api/track`, Admin → Vendor drafts |

### Preserved (unchanged rules)
- **ABN** validation, **email verification** (`email_confirmed_at` required to save), **Vendor Service Agreement** recorded via `record_legal_acceptance` before a listing exists, **one listing per account**, listings created as **draft**, 3 photos + 1 package before review, **admin approval** before public — all now in one shared function, `src/lib/vendor-listing-create.ts`, used by both the old form and the new flow.
- **Nothing is published without the owner**: drafts are a separate, service-role-only table; a draft only becomes a (draft) listing when its verified owner saves it.
- Rate limits on draft saves, suggestions and draft-link emails (per IP and per address).

### Compatibility
- `/founding-vendors`, `/vendor-signup` (the 5-step form), sign-up, finish page, vendor dashboard, planner, booking flow: unchanged, except `/vendor-signup` now forwards a signed-in vendor who has a pending draft to `/become-a-vendor/save` (so sign-up returns them to their draft).
- Footer "List your business" now points to `/become-a-vendor`. Ads and DMs still point to `/founding-vendors` until you decide.

---

## Tests

| Suite | Result |
|---|---|
| `npx vitest run` (unit + PGlite SQL, all) | **124 files, 993 tests passed** |
| New: `tests/unit/vendor-journey.test.ts` | 19 passed — draft sanitising, one-question steps, save readiness, scenario honesty, writer uses only vendor facts, packages unpriced, access rules, tracking ↔ migration in step |
| New: `tests/sql/vendor-listing-drafts.test.ts` | 3 passed — no anon/vendor/admin-role access to drafts, hash-only tokens, assisted permission constraint, purge, funnel counts incl. genuine-enquiry rules, admin+MFA only, rollback |
| `npx tsc --noEmit`, `npx eslint src tests` | clean |
| `next build` (isolated, no `.env.local`) | succeeds |
| New E2E: `tests/e2e/vendor-journey.mjs` (phone 390×844 + desktop) | **60/60 passed** |
| Real database (local Supabase with production's schema): `tests/e2e/real-supabase/` | **39/39** access probes, **32/32** journey checks with real sign-up emails (25 Nov) |
| Existing E2E: `tests/e2e/signed-in.mjs` (customer: tab bar, planner card, saved, event board, messages, quotes, sign-out) | **all passed** |

**Bugs the tests caught and fixed:** an over-long pasted bio was discarded instead of trimmed; the landing
page view lost its source tag; the category step was never recorded (stale state on auto-advance).

**Isolation:** E2E ran on a production build of a copy of the app **without `.env.local`**, pointed at the in-memory mock (`tests/e2e/mock-supabase.mjs`, new `MOCK_PORT` so it didn't touch another session's mock), with every non-local browser request aborted. The only outside request is the existing suburb lookup (Photon) for the word "Mosman".

## Mobile screenshots
`screenshots/before/` (current journey) and `screenshots/after/`:
01 landing fold · 02 full landing · 03 scenario · 04 pricing/eligibility · 05 assisted help · 06–12 one question per screen (category → packages) · 12b preview sheet · 13 review · 14 resumed on another device · 15 desktop builder · 16 claim link · 17 claim review · 18 ABN + agreement.

---

## Deploy order (needs approval)

1. **Apply** `supabase/migrations/20261130090000_vendor_listing_drafts.sql` (rollback in `supabase/rollbacks/`). Until it's applied, the builder still works on the device, but nothing saves to the server, "Save my listing" can't find the draft, and new funnel events are dropped. So: **migration first, then deploy.**
2. Merge + deploy.
3. Optional: `ANTHROPIC_API_KEY` for Claude-written suggestions. Default model is `claude-opus-5-5` at low effort; a cheaper model is a one-line change if you prefer.
4. Then decide where Instagram bio / DMs / ads point.

## Known limits and risks
- Photos aren't part of the pre-account draft (storage is per account); they come after saving, or via Setup requests for assisted drafts.
- Someone holding a forwarded claim link can **edit** that draft but can't **save** it (needs the owner's verified email). The page tells owners not to forward it; admins can revoke.
- "Email me a link" could be used to send one email to an arbitrary address; limited to 5/hour per IP and 3/day per address, with neutral wording.
- `vendor_listing_drafts` isn't in the generated Supabase types yet (regenerate after applying).
- The demand problem (0 genuine enquiries) isn't something this PR can fix; see the strategy.
