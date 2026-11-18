---
name: evntly-lead-finder
description: Find real, active Sydney event vendors (photographers, videographers, DJs, decorators, MCs, florists, makeup artists…) who are not yet on Evntly, from permitted public sources only, verify each on its own website, score and dedupe them into a CSV ready for Sai's approval. Use for "find more vendors", "new leads", "research batch".
---

# Evntly vendor lead finder

Output: `outreach/leads/YYYY-MM-DD-batch.csv` (gitignored folder) +
a short summary. Import into `vendor_prospects` only after Sai says yes.

## 1. Pick the gap

Run `evntly-acquisition-truth/sql/verified_vendors.sql` and
`evntly-pipeline-tracker/sql/priority_queue.sql`. Research the category with
the fewest contactable leads in the queue. Default priority: photographers,
videographers, DJs, decorators/stylists, MCs, florists, makeup artists, then
celebrants, cakes, photo booths, hire.

## 2. Discover (permitted sources only)

Allowed, read like a human, a few pages at a time:
- Web search (WebSearch tool) for e.g. `"birthday party photographer" Parramatta`, `"wedding DJ" "Inner West"`, `"balloon garlands" Sydney "ABN"`.
- The vendor's own website (About / Contact / Pricing pages).
- Public Google Business info as shown in search results (no Maps scraping; the Places API only if Sai approves its cost).
- Public Instagram/Facebook profiles opened one at a time in Chrome "Browser 1" (read-only, no automation, no follow/like). Bio + last post date only.
- Public industry directories and association member lists **within their robots.txt** (see `evntly-competitor-scan` for competitor marketplaces).
- ABN Lookup (abr.business.gov.au) to confirm an active ABN and NSW location.

Not allowed: logged-in scraping, Instagram/Facebook APIs or scripts, private
groups' member lists, buying lists, LinkedIn scraping, harvesting emails from
competitor enquiry forms, guessing emails (`info@` pattern guessing), anything
behind a captcha or disallowed by robots.txt.

## 3. Verify each candidate (all must pass, else drop)

1. Business shown on its own site or public profile (that URL = `source_url`).
2. Sydney / Greater Sydney service area stated.
3. Active: post, blog, review or portfolio item in the last 90 days.
4. Relevant category Evntly supports (check `src/lib/categories` if unsure).
5. Real business signal: ABN shown or found in ABN Lookup, or a trading website with pricing/packages.
6. Contact route that is PUBLIC and BUSINESS: published business email (note
   the page → `consent_basis = published_business_address`, unless the site says
   "no unsolicited marketing"), Instagram handle, or business phone.

## 4. Dedupe before anyone sees it

Paste candidates into `evntly-acquisition-truth/sql/dedupe_candidates.sql`.
Keep only `verdict = 'new'`. Also grep `outreach/` CSVs for the handle/domain.

## 5. Score

`lead_quality`: A = active in last 30 days + private-event focus (birthdays,
engagements, corporate, cultural) + packages/prices published; B = active,
relevant; C = weak signal. Priority score is computed later by
`priority_queue.sql` / `src/lib/acquisition/lead-score.ts`.

## 6. Output CSV columns

`business_name,category,suburb,website,email,instagram,phone,source_url,lead_quality,consent_basis,notes`
- `notes`: one line of personalisation evidence ("posted a 1st birthday shoot in Kellyville 9 Nov") + date checked.
- Never fill a field you didn't see. Empty is fine.

## 7. Hand-off

Summarise: N checked, N kept, N dropped (with reasons), by category. Ask Sai
to approve the import. On yes: import via Admin → Beta Vendors → Import CSV
(goes through `admin_import_prospects`, which dedupes again and audit-logs),
or, if Sai asks Claude to do it, an INSERT with matching
`vendor_prospect_events` rows (`action = 'imported'`).

Pace: ≤ 30 verified leads per session; quality over volume.
