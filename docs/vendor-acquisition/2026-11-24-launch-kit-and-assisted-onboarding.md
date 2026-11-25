# Launch kit and founder-led assisted onboarding

**24 Nov 2026 · templates for Sai's approval. Nothing posted, sent or changed.** Use only after PR #97 is
live and verified, and PR #98 makes `/become-a-vendor` the primary destination.

## 1. Destinations (attribution preserved)

Every link carries a source tag so the Growth dashboard can credit it. Existing tags only
(`src` values must be valid founding sources; `utm_content` is free text ≤ 40 chars).

| Where | Link | Notes |
|---|---|---|
| Instagram bio | `https://evntlyapp.com/become-a-vendor?src=instagram_bio` | Replaces the current bio link. Customer link stays in Highlights. |
| Instagram DMs (outreach) | `https://evntlyapp.com/become-a-vendor/start?src=instagram_dm&utm_content=dm_<yyyymmdd>` | Straight to the builder: they're warm, skip the pitch |
| Instagram stories | `https://evntlyapp.com/become-a-vendor?src=instagram_story&utm_content=story_<topic>` | |
| Email outreach | `https://evntlyapp.com/become-a-vendor?src=direct_outreach&utm_content=email_<yyyymmdd>` | |
| Vendor-to-vendor referral | `https://evntlyapp.com/become-a-vendor?ref=<their code>` | Existing referral codes |
| **Meta ads (when resumed)** | Keep `https://evntlyapp.com/founding-vendors?src=meta_ads&utm_content=<ad>` | Ad URLs **unchanged**, so ad review and history stay intact; after #98 the page's Claim button opens the builder and keeps the tags |

**Paid vendor advertising stays paused** until the new funnel shows, on at least 20 warm visitors, that
draft → verified → completed works. Resume criteria (suggested): ≥ 30% of builder starters reach the
preview, and ≥ 3 completed listings from the new flow.

## 2. Outreach templates (personalise every one; Sai approves and sends)

**First message (warm, after you've looked at their work):**
> Hi {first name}, I'm Mohnish — I run Evntly, a new Sydney marketplace for event vendors. Loved {one
> specific thing from their work}. We're building it with a small group of Sydney vendors first: free
> listing, no commission. You can see what your profile would look like in a few minutes, no account
> needed: {DM link}. Or if you'd rather, I can set it up with you — just say yes and I'll draft it for
> you to check.

**If they say "set it up for me" (assisted):**
> Great — I'll draft it from your Instagram and send you a private link to check. Could you send me:
> your usual starting price, 3 photos you're proud of, and the email you'd like to use? Nothing goes live
> until you've checked it and pressed submit.

**Sending the claim link (after creating the draft in Admin → Vendor drafts):**
> Here's your draft, {first name}: {claim link}. It's private. Change anything, add your ABN, and save it.
> I'll add the photos you sent once you tick the box. Any questions, just reply here.

**One follow-up only (if no reply after 5 days):**
> Hi {first name}, just checking the link reached you. No pressure at all — happy to leave it here.

## 3. Assisted onboarding workflow ("almost effortless")

Target: owner effort **under 5 minutes**; founder effort ~20 minutes per vendor.

1. **Find & qualify** (`evntly-lead-finder`, permitted public sources, verified on their own site).
2. **Ask permission** (personal DM/email, template above). Record nothing until they say yes.
3. **Record consent** in Admin → Vendor drafts: owner email, *how* and *when* they said yes, tick the
   confirmation. (The database refuses an assisted draft without this.)
4. **Draft from their own material**: category, suburb, events, starting price they gave you, a
   description in their voice. Packages stay unpriced unless they gave you prices.
5. **Copy the claim link (shown once)** and send it yourself. Press **Mark sent**.
6. **They check and save**: confirm email, ABN, agreement, optionally "add the photos I sent you"
   (creates a Setup request).
7. **Add photos** in Admin → Setup requests; they submit for review; you approve.
8. **First enquiry within 7 days**: use the customer plan to bring them one genuine lead. Tell them
   personally when it arrives. This is the moment that makes a vendor stay.
9. **Ask for one introduction** to another vendor they respect.

Safeguards: revoke a link if it went to the wrong person; drafts expire after 30 days; only the owner's
verified email can save; nothing is ever public until they submit and you approve.

## 4. Copy change needed after launch (not in these PRs)
The automated "no listing yet" reminder emails (24 h / 72 h) still link to the old form. After #97 is
live, point them to `/become-a-vendor/start` (wording change → needs your approval).
