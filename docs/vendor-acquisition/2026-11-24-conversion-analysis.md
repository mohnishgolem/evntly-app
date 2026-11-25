# Why vendor visitors aren't converting — conversion analysis

**24 Nov 2026 · Evntly · prepared with Claude Code**
**Sources:** production Supabase (read-only SELECTs, counts only, test/internal accounts excluded by the
`evntly-acquisition-truth` rules), and an end-to-end phone-sized browser walk of the live journey on an
isolated copy of the app. No production data was changed and no vendor was contacted.

> Small numbers. 16 genuine vendor accounts and ~390 landing visitors in 30 days. Read every rate as
> directional; the absolute counts are what matter.

---

## 1. The headline: no approved vendor has received a genuine enquiry yet

| Measure (all time unless noted) | Count |
|---|---|
| Genuine vendor accounts (all email-verified) | **16** |
| …with a listing | 13 |
| …approved | **12** |
| …completed (approved + 3 photos + 1 package) | **8** |
| Quote requests to *real* (non-demo) approved vendors from *real* customers | **0** |
| Quote requests ever | 6 — all to demo listings, 5 of them sent by an admin account |
| Customer accounts | 14 |
| Vendor profile page visitors, last 30 days | 36 |

The success metric for this work is *approved, active vendors who get value from Evntly*. Today that is
**0 of 12**. Getting vendor #13–#20 listed doesn't change that on its own; it makes the empty-marketplace
problem bigger. Every recommendation below is ranked with this in mind.

## 2. Visitor funnel, last 30 days (unique visitors, bots excluded)

| Step | Visitors | Rate |
|---|---|---|
| Visited `/founding-vendors` | 388 | — |
| Tapped **Claim** | 20 | **5.2%** ⬅ biggest loss |
| Saw the sign-up form | 20 | 100% |
| Tried to sign up | 16 | 80% |
| Vendor accounts created (all channels) | 18 events | — |
| Opened the listing form | 8 | — |
| Submitted for review | 4 | ~50% of form openers |

Weekly landing visitors: 46 → 136 → 183 → 28 (current partial week): the Meta campaign drove the spike.

### By source — warm beats cold by ~7×

| Source | Landing visitors | Claimed | Rate | Genuine vendors | Completed listings |
|---|---|---|---|---|---|
| Meta ads | 158 | 3 | **1.9%** | 2 | **0** |
| No source | 167 | 2 | 1.2% | 2 | 0 |
| Instagram DM | 30 | 5 | **16.7%** | 3 | 1 |
| Direct outreach | 30 | 4 | **13.3%** | 3 | 2 |
| Waitlist email / IG bio / direct | 9 | 6 | — | 6 | 5 |

**All 8 completed listings came from personal channels.** Paid traffic produced 2 accounts and 0 completed listings.

### Other signals
- **Done-with-you help: 0 requests ever** (`listing_setup_requests`), although "Set it up for me" sits beside Claim.
- **Sign-up errors:** 7 (5 weak password before the hint changed, 2 unknown).

## 3. What the live journey asks of a visitor (phone, 390 × 844)

Screenshots: `screenshots/before/`.

1. **Landing (`/founding-vendors`):** 7.6 screens long. The first screen ends with *"You'll need your ABN"* — a
   requirement before any value has been shown.
2. **First tap = account wall:** name, email, password, Google, three checkboxes (terms, vendor agreement,
   marketing) — *"Step 1 of 2: create your free account"* — before the visitor has typed one word about their business.
3. **Then** email code, then a 5-step form where **nothing is saved to the server until the last step**, and
   the last step needs the ABN and the agreement (again).

In Airbnb's terms, Evntly asks for commitment first and shows value last. A photographer who taps an
Instagram ad on their phone between shoots is asked for a password before they've seen what their
listing would look like.

## 4. Why visitors don't convert (ranked by vendors lost)

1. **No proof of demand, and visitors can tell.** The landing page honestly says enquiries "are only just
   starting". Cold visitors (ads) have no reason to trust a new marketplace; warm visitors trust *Mohnish*,
   which is why DMs convert 7–9× better. This can't be fixed with UI alone.
2. **Account before value.** The first action costs a password and three consents. Warm visitors push
   through; cold ones don't (1.9%).
3. **Requirements framed as the pitch.** "You'll need your ABN" above the fold; the business value
   (quote requests with event details, $0 fees, a shareable profile) is under the fold or absent.
4. **The listing form loses half its starters** — nothing saved until the end, ABN required to save, device-bound.
5. **Help is offered but not used** — "Set it up for me" is a form, not a person. Zero uptake suggests it
   reads as a waitlist, not as service.

## 5. What the new journey changes (and how we'll know)

| Problem | Change in this PR | Measured by (`admin_vendor_journey_funnel`) |
|---|---|---|
| Account before value | Build a private listing with **no account**; account only at "Save" | builder_started ÷ landing visitors |
| Requirements as the pitch | Opportunity-first `/become-a-vendor`; ABN/agreement stated plainly in a "Pricing, eligibility and checks" section, asked only at save | vendor_cta ÷ landing |
| Form leaks, device-bound | One question per screen; saved on device instantly and on server after Q2; private "continue later" email link | preview reached; drafts saved; draft_resumed |
| Blank-page writing | Suggested description from the vendor's own words; starter packages with **no** price; vendor approves each | suggestion_used; packages per listing |
| Help unused | Admin-assisted drafts with recorded permission + claim link; owner reviews and approves | assisted drafts → claim opened → saved |
| No demand | **Not solvable in code** — see the founder-led strategy | steps 13–15: genuine enquiries |

Success is judged on stage 14–15 (approved vendors, and those who received a genuine enquiry), not traffic or sign-ups.
