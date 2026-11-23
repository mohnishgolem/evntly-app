# Evntly vendor acquisition skills

Reusable Claude Code skills for getting **real Sydney event vendors** onto Evntly
(goal: 200 genuine registered vendors; immediate goal: 20 completed listings).
They sit on top of what Evntly already runs: `vendor_prospects` +
`vendor_prospect_events` (pipeline with DB-enforced consent / do-not-contact /
one-follow-up rules), Admin → Beta Vendors, `funnel_events`, `page_views`,
`beta_applications.source/campaign`, the listing completion gate and the
daily report task.

| Skill | Use it to | Writes anything? |
|---|---|---|
| `evntly-acquisition-truth` | Get verified numbers (test accounts and duplicates excluded). Every other skill uses its SQL. | No (read-only SQL) |
| `evntly-lead-finder` | Discover Sydney vendors from permitted public sources, verify, score, dedupe. | Local CSV only; DB import needs Sai's OK |
| `evntly-competitor-scan` | Use public competitor directories (Easy Weddings, Event Heroes…) as a *signal*, within robots.txt and terms. | Local notes only |
| `evntly-outreach-drafter` | Write personalised IG / Facebook / email first messages into the approval queue. | Drafts only (Gmail drafts, queue file, Acquisition Desk) |
| `evntly-pipeline-tracker` | Prioritise the lead queue and record each stage (contacted, replied, registered, completed). | DB writes only after Sai confirms the real-world event |
| `evntly-listing-followup` | Find registered vendors with incomplete listings and draft the right nudge. | Drafts only |
| `evntly-meta-verified-roi` | Judge Meta Ads on verified registrations / completed listings, not clicks. | No |
| `evntly-daily-acquisition-report` | Daily targets, conversion report, what's waiting for Sai. | Local report + Desk snapshot |
| `reverse-engineer-app` | Study a public competitor app (UI, journeys, observable tech) after checking its robots.txt and terms; compare with Evntly; ranked plan; build original versions only after approval. `/reverse-engineer-app <URL>` | Local analysis folder (gitignored); code only on a branch after Sai approves |

## Hard rules (apply to every skill)

1. **Never invent a lead.** Every lead has a `source_url` that a human can open
   and that shows the business. No source URL, no lead.
2. **Never report an unverified registration.** Counts come from
   `evntly-acquisition-truth` (email-confirmed accounts, test accounts excluded,
   one per email). Clicks, page views and "said they signed up" are not registrations.
3. **Nothing is sent, posted, published, spent or deployed without Sai's
   explicit approval for that specific item.** Skills produce drafts.
4. **No mass messaging.** First messages are one-to-one, personalised, sent by
   hand by Sai (or in a session Sai attends after per-message approval).
   Instagram ≤ 10–15 new DMs/day, Facebook none while message requests are
   capped, email from Gmail (never Resend) ≤ 20/day. One follow-up max.
5. **No unauthorised scraping.** No logged-in scraping, no private data, no
   bypassing rate limits, captchas or robots.txt, no Instagram/Facebook
   automation or unofficial APIs. Manual reading of public pages only, at
   human pace.
6. **Australian Spam Act 2003**: commercial email only with consent (inferred
   consent = business address conspicuously published, no "no marketing"
   notice, message relevant to their business), identify Evntly + Sai, include
   an easy opt-out, honour it permanently (`do_not_contact`).
7. **Privacy**: vendor emails and phone numbers stay in Supabase and Sai's
   local files. Never put them in artifacts, chat summaries, URLs or third-party tools.
8. Migrations, code deploys and DB imports each need separate approval
   (production Supabase is shared by local dev).

See `SECURITY.md` in the repo root and `docs/acquisition/implementation-plan.md`.
