---
name: evntly-listing-followup
description: Find Evntly vendors who registered but haven't completed their listing (no listing yet, missing photos or package, awaiting review), work out the one thing each needs, and draft a short follow-up for Sai's approval. Use for "stuck vendors", "incomplete listings", "nudge vendors to finish".
---

# Evntly listing follow-up

Goal: turn registered vendors into **completed listings** (approved + 3
photos + 1 active package). This is the cheapest win in the funnel.

## Steps

1. Run `evntly-acquisition-truth/sql/incomplete_listings.sql`.
2. Check what's automatic already, so we don't double-message:
   - draft-listing reminders at 24h/72h (cron `listing-reminders`, PR #62);
   - any message in the last 3 days in `outreach/` logs, Instagram thread or Gmail;
   - an open `listing_setup_requests` row (then the next step is ours, not theirs:
     put it in Admin → Setup requests, don't nudge the vendor).
3. Pick the action by `stuck_at`:

| stuck_at | Action |
|---|---|
| 1_email_not_confirmed | Account email: "your code expired? log in here" with `/login` (PR #63 links are scanner-safe). |
| 2_no_listing_started | One message: finish in 10 min at `/vendor-dashboard/finish`, or reply with photos + prices and we'll set it up. |
| 3/4/5 needs photos/package | Name exactly what's missing ("3 photos and one package"), link `/vendor-dashboard/finish`, offer done-with-you setup. |
| 6_ready_to_submit | "Tap Submit for review", link `/vendor-dashboard/finish`. |
| 7_waiting_for_our_review | No vendor message. Flag to Sai: review in Admin → Approvals today. |

4. Channel: the thread they already use with us (IG DM / Sai's FB / email
   reply). Account email is allowed for their own listing (transactional).
5. Limits: one nudge per vendor per stage; stop after two total unanswered
   nudges; anyone who says stop → no more messages.
6. Draft into `outreach/queue/YYYY-MM-DD-listing-followups.md` (and the Desk
   `approvals` collection) as `awaiting_approval`. Style: 2–3 lines, one emoji,
   specific, helpful, no guilt.
7. Report: N stuck, by stage, top 3 to unblock today.
