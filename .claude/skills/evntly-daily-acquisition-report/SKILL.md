---
name: evntly-daily-acquisition-report
description: Evntly's daily vendor acquisition report — verified registrations and completed listings vs the daily target, conversion by channel, the prioritised queue, stuck vendors and everything waiting for Sai's approval. Use for the 9am report, "where are we today", or to refresh the Acquisition Desk.
---

# Evntly daily acquisition report

Read-only except for writing the local report and refreshing the Desk snapshot.

## Build

1. Truth: `evntly-acquisition-truth/sql/verified_vendors.sql` and `daily_by_source.sql`.
2. Targets: two goals, both shown honestly.
   - **200 verified registrations by 30 Nov 2026**: required pace =
     ceil((200 − verified) / days left incl. today). Compare with the 7-day
     actual pace. If required > 3× actual, say plainly the date is out of reach
     at the current rate and show the realistic date.
   - **20 completed listings** (immediate goal, recovery plan 18 Nov).
   - Daily activity targets that drive them (agreed caps): 15 IG first DMs,
     up to 20 emails, all stuck vendors nudged once, applications reviewed same day.
3. Conversion by channel (last 7 / 30 days): first messages sent (queue logs),
   replies, verified registrations, completed — per channel
   (instagram_dm, facebook_group, facebook_dm, email_outreach, direct_outreach (older email/fb links), waitlist, meta_ads, instagram_bio, direct/unattributed).
4. Queue: top 15 from `evntly-pipeline-tracker/sql/priority_queue.sql`.
5. Stuck vendors: `incomplete_listings.sql` grouped by stage.
6. Waiting for Sai: drafts `awaiting_approval` (queue files + Desk), applications
   to review, follow-ups due (`next_follow_up_at <= now()`), replies unanswered.

## Output

- `outreach/reports/YYYY-MM-DD.md`, opening with Sai's six points:
  first messages sent, replies, verified accounts, completed listings, stuck
  vendors, next action.
- Refresh the Acquisition Desk data file (`outreach/acquisition-desk/data.js`)
  with counts and business names only (no emails/phones) and republish the
  artifact at the same URL.

## Rules

- Every number traceable to a query or a log line; label estimates as estimates.
- Don't read Sai's personal Messenger. Don't send anything.
