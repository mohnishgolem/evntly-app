---
name: evntly-meta-verified-roi
description: Judge Evntly's Meta (Instagram/Facebook) ads by verified vendor registrations and completed listings per dollar, not clicks or landing-page views. Reads Ads Manager metrics read-only and joins them to Supabase attribution. Use for "how are the ads doing", "should we restart ads", "cost per vendor".
---

# Evntly Meta ads: verified ROI

**Read-only. Never change, publish, restart or add budget to a campaign** —
spend needs Sai's explicit approval, and Sai's rule (18 Nov) is no paid ads
until onboarding is deployed AND tested.

## Data

1. Spend, impressions, link clicks, LPV per campaign/ad set/ad and day:
   Meta Ads MCP `meta_ads_read` (ad account `act_1550912378387009`), or Sai's
   export. If unavailable, use `outreach/social/spend-log.md` (committed vs spent).
2. Evntly side, per `utm_campaign`/`utm_content`:
   - `page_views` where `kind like 'founding%'` and `source = 'meta_ads'` (visitors);
   - `funnel_events` (claim_click → signup_view → signup_attempt → account_created → email_confirmed), admin activity already excluded;
   - **verified registrations / approved / completed**: `evntly-acquisition-truth/sql/daily_by_source.sql` filtered to `source = 'meta_ads'`.
3. Pixel `CompleteRegistration` (dataset 3012878092747098) is a *Meta-reported*
   number; reconcile it with Supabase. Supabase wins when they disagree.

## Report table (per campaign and per ad)

| Spend | Impr | Clicks | LPV | Claim clicks | Accounts | **Verified** | **Completed** | **A$/verified** | **A$/completed** |

Click-through and CPC go in a footnote, not the headline.

## Decision rules (from the agreed plan)

- Target ≤ A$30 per verified registration; completed listing is the real KPI.
- Pause an ad at A$20 spent with 0 claim clicks; pause the campaign at A$45 with 0 verified registrations.
- Total acquisition cap A$1,000 (≤ A$700 Meta). Spent so far is in `outreach/social/spend-log.md`.
- With < 3 verified registrations, say "not enough data" — don't extrapolate.
- Recommendations are proposals for Sai; never act on them.

## Current state (18 Nov 2026)

A$63.30 spent (V1 A$48.76 + V3 web A$2.53 + …); Supabase shows **1 verified
registration from meta_ads (b_dj), 0 approved, 0 completed**. V3
Registrations campaign is Off (A$0). Restart is blocked on Sai's approval.
