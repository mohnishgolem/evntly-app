# Guardrails: access, evidence, originality

## Before touching a new site (access gate — before any capture)

1. Open `<origin>/robots.txt`. capture.mjs also checks it and refuses disallowed paths.
2. Read the terms of use (footer link). Look for clauses on automated access, scraping,
   reverse engineering, and building competing or similar products. Record the finding
   and date in the report's *Access & permissions* section.
   - **Bans studying the site to build a competing/similar product → STOP.** Record it,
     delete any captures, and offer Sai these options: skip the site; use third-party
     sources (published reviews, case studies, app-store listings, interviews; cite them
     and copy nothing); or get written permission or legal advice.
   - **Bans bots/automated access → screenshot mode only** (Sai captures by hand; see
     SKILL.md). Claude-driven browsing counts as automated access.
   - If a robots-disallowed path holds the terms, Sai reads them. Claude doesn't open it.
3. Note any `llms.txt` / AI-use directives and honour them (e.g. no training use).

## Allowed

- Loading public pages at human pace and screenshotting them for internal analysis.
- Reading the rendered DOM, computed styles, and network requests your own browser makes.
- Reading publicly served JS/CSS *to identify* libraries/frameworks (names, versions).
- Walking a flow up to (not including) any step that creates an account, sends a message,
  submits an enquiry/quote/booking/payment, or reaches a login.
- Using an account Sai owns on that service, read-only, with Sai entering the credentials.

## Not allowed

- Logging in with anyone else's account, guessing URLs to reach private areas, calling
  private/internal APIs directly (replaying captured requests, changing IDs), tampering
  with tokens/cookies, disabling paywalls or overlays via DevTools.
- Solving or evading captchas / bot detection; spoofing user agents or rotating IPs to
  avoid limits; ignoring crawl-delay.
- Bulk downloading (sitemaps, image sets, listing databases), harvesting vendor or
  customer contact details or reviews.
- Copying code (including "minified then prettified"), CSS, copy-text, brand names,
  logos, photos, illustrations, icon sets, fonts, or distinctive trade dress into Evntly.
- Committing competitor screenshots or captured data to git, or publishing them.

## Evidence labels

| Label | Means | Example |
|---|---|---|
| VERIFIED | Directly observed; cite the capture file / screenshot / step | "Mobile search bar is sticky (captures/search/mobile-fold.png; `sticky` list in capture.json)" |
| INFERRED | Reasoned from evidence; state the evidence and the leap | "Probably Next.js — `/_next/static/` assets and `__NEXT_DATA__` present" |
| UNKNOWN | Not observable from the client | "How search results are ranked" |

Things that are **always at most INFERRED** from browser inspection: backend language and
framework, database, hosting beyond what headers state, ranking/matching algorithms,
pricing/commission logic, fraud/moderation processes, internal service topology, team size,
conversion rates. A CDN header (`cf-ray`, `x-vercel-id`) verifies the *edge*, not the backend.

## Originality test before implementing

For each item, answer in the plan:
1. What user problem does the pattern solve? (state it without naming the competitor)
2. What would Evntly's version look like *using only Evntly tokens and components*?
3. Would a user who knows both products think Evntly copied the competitor's look?
   If yes, redesign. Generic patterns (sticky CTA, progress bar, map/list toggle, star
   ratings, step wizard) are fine; distinctive layouts, illustrations and copy are not.
