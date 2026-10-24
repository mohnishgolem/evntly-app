# Pre-launch simulation and testing — 24 October 2026

Launch: 31 October 2026. Branch with fixes: `prelaunch-sim-fixes` (not merged, not deployed).

## Before launch, in order

1. **Get real vendors live.** Every approved listing is a sample. Recruit founding vendors in 1–2 categories (photographers and DJs fit the persona demand) and a few areas, and approve them within 24 hours.
2. **Review and merge `prelaunch-sim-fixes`** (fixes #1–#5 below), then deploy.
3. **Decide on enquiries without an account.** In both the model and the simulation, it's the largest drop-off.
4. **Shorten the no-reply nudge.** Simulated customers move on after 1–2 days; today the reminder comes near the end of 7 days. Showing a vendor's typical reply time on their profile would also help.
5. **Ask founding vendors to publish at least one package** so customers can compare prices (profiles now show packages).
6. **Run the signed-in click-throughs** (launch checklist P0 #3 and #4), as customer and as vendor.
7. **Decide on fees later:** keep founding vendors free, and when fees start, keep the commission at or below about 8%.

## How this was done, and what each part can and can't tell you

| Part | Tool | What it is | What it is not |
|------|------|------------|----------------|
| Behavioural simulation | **MiroFish** (github.com/666ghj/MiroFish, AGPL-3.0, local at `~/tools/MiroFish`) running OASIS social-simulation agents on Groq's free tier. MiroFish's own Zep-based persona builder fails on the free Zep plan, so personas were written directly (`evntly-seed/sim-2026-10-24/personas.py`) | 150 hypothetical personas reacting to 20 seed posts that describe how Evntly behaves today, on a simulated Reddit-style forum, over 9 rounds | Not real users. Agents never touched the site, sometimes invent product details, and are steered by the seed posts |
| Growth and fee scenarios | Rule-based Monte-Carlo model (`evntly-seed/sim-2026-10-24/funnel_model.py`, 200 runs per scenario) | Shows how sensitive the funnel is to each assumption, using the same 150 personas | Not a forecast. Every rate is an assumption listed in the file |
| Real application testing | Playwright (Chromium desktop + WebKit iPhone 13) against https://evntlyapp.com, read-only; localhost dev server for fixes; Supabase SQL and REST probes | Real pages, real search results, real security headers and access rules | Signed-in flows were **not** run on production: creating test accounts or quote requests there would put test data into the live database |

Personas: 100 customers (18 wedding couples, 16 birthday organisers, 14 corporate planners, 12 students, 12 budget-conscious, 10 premium, 10 first-timers, 8 repeat), 40 vendors (8 photographers, 6 DJs, 5 decorators, 5 caterers, 4 each of videographers, MCs, planners and entertainers; split across new solo, established, budget and premium tiers), 10 ops staff (support, onboarding, moderation, operations, fraud and trust). Budgets, suburbs, tech ability, trust level, device, reply speed and fee tolerance vary per persona. They are invented, not Sydney market research.

## Confirmed problems found and fixed (on the branch)

| # | Problem | Evidence | Fix |
|---|---------|----------|-----|
| 1 | **Search breaks on commas and brackets, and accepts injected filter syntax.** "North Sydney, NSW" returned *no vendors* while "North Sydney" returned one. The input `x%,status.neq.approved` was spliced into the database filter and returned all 14 listings. It can't expose data: the approved-only filter and RLS still apply, and vendor contact columns can't be read by visitors (checked). | Live curl tests on evntlyapp.com | Search text is cleaned (`src/lib/search-term.ts`): keeps the part before a comma, drops "NSW" and postcodes, strips filter characters, and quotes the value. Unit tests in `tests/unit/search-term.test.ts`. Re-tested on localhost: "North Sydney, NSW" → 1 vendor |
| 2 | **A suburb with no vendor is a dead end.** Photographer + "Parramatta" (scenario 1) and decorator + "Penrith" (scenario 4) both showed "No vendors match those filters", with nothing else to do. | Playwright, desktop and iPhone | When a search finds nothing, Explore now shows the category's vendors with "No vendors list 'Parramatta' yet. Most vendors travel across Sydney…" and a link to post the event. The plain empty state also links to posting the event |
| 3 | **Sign-up throws away where the customer was going.** "Sign up to request a quote" on a vendor page and the Start-planning wizard both send people to `/signup?next=…`, but sign-up ignored `next`: customers landed on the home page after confirming their email, so the vendor and the plan were lost. The plan draft was only claimed if they later opened My Events, and never if they confirmed on another device. | Code trace: `signup` action, `/signup` page, `AuthTabs` | `next` is kept through email sign-up, Google sign-up and switching between the Sign up and Log in tabs. Vendors still go to listing setup, and off-site `next` values are refused. Tests added in `tests/unit/auth-email-links.test.ts` |
| 4 | **New vendors are told "we'll email you when it's live", but nothing emails them,** and admins aren't told a listing is waiting, so a new vendor can sit unapproved without anyone knowing. | Code trace; database triggers checked (none send email) | Approving a listing emails the vendor (sample listings are skipped). Submitting a listing emails every admin with a link to Approvals. Tests use the real Supabase client with only the network faked: `tests/unit/vendor-approval-emails.test.ts` |
| 5 | **Vendor packages are invisible to customers.** Vendors can build fixed-price packages under Service & pricing, and anyone may read them, but the public profile only showed an hourly rate. | Code trace | Vendor profiles now show a Packages section (price, hours, extra-hour rate, deposit, inclusions). Not seen with real data yet: no vendor has a package |

Checks on the branch: 341/341 unit tests, typecheck, lint and `next build` all pass. Explore, sign-up and vendor profile pages were checked on localhost (desktop and 375px phone width).

## Things checked that are fine

- All public pages load on desktop Chromium and iPhone WebKit with no console errors and no sideways scrolling. Most load in about 1–2 s; the first cold home-page load took 7 s on desktop.
- Security headers: HSTS, nonce-based CSP, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies.
- Signed-out REST reads of users, events and vendor payout details return nothing. Quotes, messages, bookings, disputes, notification preferences, risk reviews and match runs are refused. Vendor phone and email columns are refused.
- Supabase security advisors show only the items already reviewed as intentional (RLS tables written only by the service role, and RLS helper and RPC functions).
- Sample listings are clearly labelled everywhere, and their profile says they can't take quote requests.

## Why simulated customers would leave (MiroFish + model, ranked)

How the run went: 150 agents, 9 rounds, 93 agent-written posts and replies from 73 different agents (59 by customers, 27 by vendors, 7 by ops), plus 20 seed posts. The first run used `openai/gpt-oss-120b`; a network drop on this Mac cut round 6 to 5 actions and left rounds 7–8 with none, so 3 continuation rounds were run on `openai/gpt-oss-20b` (the 120b daily allowance was used up), starting from all posts and replies so far. Counts below are a keyword tally over that text (`mirofish_theme_tally.json`), so treat them as rough.

| Theme (all agents) | Mentions | Who raised it |
|---|---|---|
| Trust: zero reviews, "is this real?", checking the ABN | 45 | 23 customers, 18 vendors, 4 ops |
| Expects a reply within 1–3 days | 26 | 18 customers, 8 vendors |
| Wants fixed, all-in or per-head prices up front | 22 | 15 customers, 7 vendors |
| Goes or pushes off the platform (DMs, Instagram, "no sign-up needed") | 19 | 12 vendors, 6 customers, 1 ops |
| Platform fees | 18 | 13 vendors, 3 customers, 2 ops |
| Wants a phone call before booking | 13 | 9 customers, 3 ops, 1 vendor |
| No vendor nearby / widen the area | 11 | 9 customers, 2 vendors |
| Deposit, cancellation or no-show protection | 8 | 5 customers, 2 ops, 1 vendor |

Why simulated customers leave, most to least common:
1. **They can't tell whether a listing is real.** Wedding couples and low-trust personas kept asking how to verify a vendor with no reviews. What they said would reassure them: ABN, a portfolio with recent work, a verification badge, references and a signed agreement. Today every approved listing is a labelled sample, so the honest answer is "none are real yet".
2. **They won't wait 7 days.** Customers said they give a vendor "a day or two" or "2 days", then switch to Instagram DMs or a phone call. Evntly's reminder comes near the end of a 7-day window.
3. **Hourly prices don't let them compare.** Budget customers and birthday organisers wanted all-in packages; caterers' customers wanted per-head prices. Packages are now shown (fix #5), but vendors have to create them.
4. **They want a quick call before committing,** and hidden contact details read as friction. Some asked for a short in-app call or chat option rather than full contact details.
5. **Nothing local.** Several customers asked for vendors in a specific suburb and got suggestions to "widen the radius". This matches the Explore dead end fixed in #2.
6. **Deposits.** With no in-app payments, customers asked who protects a deposit if a vendor cancels or doesn't show.

What the agents got wrong, so it isn't used as evidence: an ops agent said Evntly has an escrow and a "standard service agreement"; another invented a "Music & Audio" category; a student agent posed as a DJ with a fake ABN.

## Why simulated vendors would refuse, abandon or go quiet

1. **Fees decide whether they stay.** Fee talk came almost entirely from vendors (13 of 18 mentions). Most named a ceiling of 5–10% (some up to 15%), compared Evntly with Bark's per-lead fees and Easy Weddings' yearly listing, and said they'd go back to those above their ceiling. This is consistent with the fee table below.
2. **They pull customers into DMs.** The most frequent vendor behaviour was answering a customer's post with a rate and "DM me", "give me a call" or "no sign-up needed, just send me a DM". Expect this on day one. Contact masking, photo scanning and the leakage flags exist for this reason; the risk is vendors putting their handle in bios or business names.
3. **Leads before commitment.** Vendors with no reviews said they'd need a few bookings or testimonials before investing time in a new platform, and offered first-client discounts to get them. A founding-vendor offer (free period, featured placement, help building the first package) fits what they asked for.
4. **The listing doesn't fit everyone.** Caterers price per head; entertainers (magic, face painting, roving acts) have no category; videographers' showreels are far bigger than the 50 MB limit. These vendors either can't list properly or list under the wrong category.
5. **Approval wait.** Raised in a seed post, but few agents engaged with it. The fix (#4) removes the silent wait either way.

## Customer scenarios (Phase 3)

| # | Scenario | What really happens today | Main risk | Status |
|---|----------|---------------------------|-----------|--------|
| 1 | Photographer in Parramatta, $1,000 | No real vendors yet (all 14 approved listings are samples). Searching the suburb gave "No vendors match" | No supply, then a dead end | Dead end fixed (#2); supply is the launch blocker |
| 2 | Wedding needing 5 vendors | Event board tracks quotes per vendor; celebrant, videographer and makeup categories exist | Each vendor needs its own enquiry; no real supply in most categories | Works in code; needs vendors |
| 3 | Comparing photographers | Compare sheet and saved vendors exist, but prices were hourly only | Can't compare like for like | Packages now shown (#5); vendors must create them |
| 4 | No vendors in location | Exact text match on suburb, no distance search on Explore | Leaves | Fallback list + "post your event" (#2) |
| 5 | No reply to an enquiry | Vendors have 7 days; reminders, then 3 similar vendors suggested | Simulated customers fall back to Instagram after 1–2 days | Consider showing typical reply time; shorten the nudge |
| 6 | Multiple quotes | Quotes listed together with GST invoices; contacts hidden until booking | Some want a phone call first | Intentional (anti-leakage); explain why on the quote page |
| 7 | Booking on a phone | Layout fine on iPhone; quote requests need an account | Signed-out drop-off; lost context after sign-up | Context loss fixed (#3) |
| 8 | Abandons onboarding | Plan wizard asks 6 things, then sign-up | Draft lost after sign-up | Fixed (#3) for the same device |
| 9 | Cancels a booking | Customer can cancel; vendors add cancellation terms per quote; no in-app payments yet | Deposit paid directly to the vendor isn't protected | Payments decision is still open (launch checklist P0 #6) |
| 10 | Vendor legitimacy | ABN, founding badge, verified-only reviews, report and block | New vendors have no reviews | Show ABN-checked state, reply time and portfolio count prominently |

## Vendor scenarios (Phase 4)

| # | Area | Today | Risk |
|---|------|-------|------|
| 1–2 | Sign-up and business onboarding | 4-step listing form, then admin approval | Silent approval wait → fixed with emails (#4). Approve within 24 h in launch week |
| 3 | Portfolio | Photos ≤10 MB, videos ≤50 MB | Videographers' showreels are far bigger; the copy already says to trim a clip. Allow a YouTube or Vimeo link later |
| 4–5 | Packages and pricing | Packages and hourly rate; no per-head pricing | Caterers can't express per-head prices; packages weren't shown (fixed #5) |
| 6 | Location and availability | Service radius, travel fee, blocked dates and weekdays | Fine; radius is used by event-board matching but not by Explore search |
| 7 | Enquiry notifications | Email + optional push, 24 h reminder | Resend Free is 100 emails/day; the new admin emails add to it |
| 8–9 | Quotes and bookings | Quote form with cancellation terms; booking confirm; job cards | Not run end to end on production in this pass |
| 10 | Commission and payments | Free now; payments built but switched off | Simulated vendors cap fees at about 10% (see the fee table) |

Gap from the persona list: there is **no "entertainment" category** (magicians, face painters, roving acts, bands). Those vendors would have to list as DJ or MC, or not at all.

## Marketplace growth (Phase 5): rule-based model, NOT a forecast

Assumptions (all in `funnel_model.py`): 40 km default service radius; 30% base chance a visitor signs up to enquire, adjusted by trust, tech ability and device; 2–3 enquiries per vendor needed; vendor replies 85% of the time if within the customer's patience, otherwise 35%; quote accepted 45% if within that category's share of the budget, otherwise 12%; vendors with no leads in a month leave 35% of the time; 3 months.

| Scenario | Fixes | Visitors who book | Enquiries answered | Bookings (3 months) | Leads per vendor per month | Vendors still active | Vendors with no booking |
|---|---|---|---|---|---|---|---|
| A early launch | before | 4.7% | 76% | 2.8 | 0.5 | 51% | 79% |
| A early launch | after #2, #3 | 5.6% | 76% | 3.4 | 0.6 | 56% | 76% |
| B growing | before | 7.3% | 77% | 54 | 2.4 | 83% | 51% |
| B growing | after #2, #3 | 9.4% | 77% | 69 | 3.0 | 85% | 45% |
| C scaling | before | 7.7% | 77% | 230 | 2.7 | 86% | 46% |
| C scaling | after #2, #3 | 9.8% | 77% | 293 | 3.4 | 88% | 41% |

Fee options on scenario B (after fixes), 3 months:

| Option | Vendors still active | Bookings | Evntly revenue (model) |
|---|---|---|---|
| free (founding) | 85% | 69 | $0 |
| 8% commission | 71% | 67 | $5,002 |
| 12% commission | 56% | 64 | $7,135 |
| $49/month subscription | 61% | 63 | $4,505 |
| 5% + $19/month | 68% | 67 | $5,194 |

What the model says, in plain words:
- **Scenario A (10 vendors / 50 customers) mostly fails on supply.** About a fifth of visitors find no vendor in their category and area. Vendors average 0.5 leads a month, and about half leave within three months. Recruit vendors in 1–2 categories and a few areas so that small numbers still cover each other, rather than spreading 10 vendors over 11 categories.
- **The biggest single drop at every size is customers who won't create an account to enquire.** That is an assumption, but the MiroFish students and budget customers said the same thing. A signed-out "ask a price" or guest enquiry is the largest lever. It is a product decision, so it wasn't built here.
- **Fixes #2 and #3 add about 20–30% more bookings in every scenario** under these assumptions. This is the only part of the model tied directly to code changed today.
- **Fees:** a percentage commission above most vendors' tolerance, or a flat monthly fee charged before vendors get leads, shrinks supply. In scenario B, "free → 8% commission" keeps more vendors than "12%" or "$49/month". Low commission plus a small subscription sits in between.

## Not done in this pass

- Signed-in flows on production (customer quote → vendor reply → booking → messages; vendor onboarding, portfolio upload, packages). Need either a staging Supabase project or a session where you run the steps and I watch. The launch checklist items P0 #3/#4 still stand.
- The pasted brief was cut off partway through Phase 6 ("Portfolio upl…"). Anything after that point wasn't seen.
- No changes deployed; nothing written to the production database.
