---
name: evntly-outreach-drafter
description: Write personalised first messages and the one allowed follow-up to verified Evntly vendor leads, for Instagram DM, Facebook message or email, and put them in the approval queue. Never sends. Use for "draft outreach", "write DMs", "email drafts for these leads".
---

# Evntly outreach drafter

Drafts only. Sai approves each message, then sends it (or asks Claude to send
it in a session Sai attends). See `references/templates.md` and
`references/compliance.md`.

## Inputs

Top rows from `evntly-pipeline-tracker/sql/priority_queue.sql` (not contacted,
not do-not-contact, not already a vendor) — or a list Sai gives.

## Per lead

1. Re-check today: profile still public and active; thread empty (no earlier
   message from us — search `outreach/` logs and `vendor_prospect_events`).
2. Find ONE specific, true detail from their own recent public work (a post,
   a package, a suburb). If you can't find one, don't draft — mark "needs research".
3. Channel = `next_channel` from the queue:
   - `instagram_dm`: 2–3 short casual lines, one emoji, no em dashes, the perk
     (free Founding listing + badge + Instagram shoutout for approved vendors), link
     `evntlyapp.com/founding-vendors?cat=<cat>&src=instagram_dm`.
   - `email_draft`: create a **Gmail draft** (never send) from Sai, subject
     ≤ 6 words, ≤ 110 words, sender identity, why we're writing (their published
     business address), opt-out line, link with `src=direct_outreach&utm_content=email`.
   - Facebook: only if Sai says FB message requests are open again; Sai sends from his own profile; `src=direct_outreach&utm_content=fb`.
   - `call_list`: a 3-line call note, not a script.
4. Only promise what's live (check `src/lib/config.ts`, `/founding-vendors`): free
   listing, Founding badge, first-in-search placement, IG shoutout once approved
   and complete. Do NOT mention commission deals, bundles (BUNDLES_PUBLIC=false),
   "0% for 3 bookings", or numbers of customers/bookings we don't have.
5. Write it to the queue: `outreach/queue/YYYY-MM-DD-outreach.md` with
   prospect id, channel, the evidence line, the exact message, and status
   `awaiting_approval`; mirror to the Acquisition Desk `approvals` collection
   (ArtifactData) if the Desk is in use.

## After Sai approves

- Send only the exact approved text. One vendor per action, ~2–3 min apart.
- Log send time in the queue file, then `evntly-pipeline-tracker` → `contacted`.
- Replies: draft the answer (same style, mostly the link); new approval each time.
- Follow-up: exactly one, ≥ 7 days later, only if no reply. Then stop.
- "No", "stop", "not interested", bounce → `do_not_contact` immediately.

Daily caps: ≤ 15 Instagram first DMs, ≤ 20 emails. Stop for the day if
Instagram shows any warning, rate-limit or logs out.
