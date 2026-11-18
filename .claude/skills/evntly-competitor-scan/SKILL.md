---
name: evntly-competitor-scan
description: Use public competitor marketplaces (Easy Weddings, Event Heroes, Bark-style directories) to learn which Sydney vendors are actively listing, then verify them on their own websites — without scraping, copying listings or using competitor-held contact data. Use for competitor research or when lead-finder needs more names in a category.
---

# Evntly competitor scan

Competitor directories tell us **who is actively marketing** in a category.
They are a signal, not a data source.

## Checked policies (18 Nov 2026 — recheck monthly)

| Site | robots.txt | Notes |
|---|---|---|
| easyweddings.com.au | `User-agent: *` allows public storefronts; disallows `/reviews/supplier/`, `/wedding/enquiry/`, `/business/`, `/api/`, `/webapi/`, `/people/`, `/mysuppliers/`; ClaudeBot crawl-delay 10s | Website terms of use page not found at `/terms` → read their footer "Terms" before each scan; if it bans automated access, manual reading only |
| eventheroes.com.au | `Allow: /`, `/llms.txt` sets `Disallow-Training: /` | No training use; manual reading fine |

## Method

1. Open the public category/location page in a browser (manual, ≤ 20 pages per session, ≥ 10 s between pages). No sitemap bulk downloads, no scripts.
2. Note only: business name, category, suburb, and that they list on that site (useful for the pitch: "you already list on X; Evntly is free for Founding vendors").
3. **Do not copy**: descriptions, reviews, photos, prices, ratings, or any contact detail shown on the competitor page. Do not use competitor enquiry/contact forms.
4. Find the vendor's own website or public profile, and verify there (lead-finder step 3). The vendor's own page becomes `source_url`; add `notes: also lists on <site>`.
5. Run `dedupe_candidates.sql`, then hand off to `evntly-lead-finder` step 5.

## Competitive notes (keep short, factual, sourced)

Record in `outreach/competitors/YYYY-MM-DD.md`: their vendor pricing model (from
their public "advertise with us" pages), categories they cover in Sydney,
gaps where Evntly is stronger (e.g. private parties, cultural events,
free Founding listing). Never claim anything about a competitor in outreach
that isn't on their public site.
