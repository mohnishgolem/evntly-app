---
name: evntly-pipeline-tracker
description: Keep every Evntly vendor lead's stage accurate in vendor_prospects — discovery, contacted, replied, interested, registered, completed listing — and produce the prioritised lead queue. Use after Sai sends messages, when vendors reply or sign up, and to answer "who should we contact next".
---

# Evntly pipeline tracker

Stages (DB-enforced by `20261106090000_vendor_acquisition.sql`):
`discovered → verified → contact_eligible → outreach_approved → contacted → interested`,
then **registered → listing approved → completed** are *derived* from real
accounts (never typed in by hand), matched by email, Instagram handle or
business name.

## Prioritised queue

`sql/priority_queue.sql` (read-only): uncontacted, not do-not-contact, not
already a vendor; ordered contactable-first then score (quality, category
priority, channel, verified). Same scoring as `src/lib/acquisition/lead-score.ts`.
`needs_contact_route` rows go back to `evntly-lead-finder` for a public
contact route, or are dropped.

## Recording events

Preferred: Sai clicks the action in Admin → Beta Vendors → Vendor acquisition
(runs `admin_prospect_action`, audit-logged, enforces consent / 7-day / one
follow-up / permanent do-not-contact).

If Sai asks Claude to record it (Supabase `execute_sql` runs as postgres, so
`is_admin()` RPCs refuse), use `sql/record_event.sql`, which applies the same
checks, and ALWAYS:
- record only what actually happened and was confirmed (send log, screenshot
  of the sent message, the vendor's reply in the thread);
- write one `vendor_prospect_events` row per change with a short factual note;
- never move a do-not-contact prospect; never set follow_up_count above 1.

## Matching registrations to leads

`sql/lead_to_vendor_matches.sql` lists prospects whose email / Instagram /
business name now matches a genuine vendor account. A human confirms each match
before it's reported as "lead converted". Ambiguous name-only matches are
reported as "possible".
