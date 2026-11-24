# Founder-led vendor acquisition: the first 200 active Sydney vendors

**24 Nov 2026 · Evntly · draft for Sai's approval. Nothing here has been sent, posted or spent.**

Think Airbnb in New York, early 2009: three people, no brand, a marketplace that mostly didn't work yet.
What moved them was going to their hosts in person, taking the photos themselves, talking to every user,
and focusing on one city where the demand was. (Paul Graham, *The Airbnbs*.)

Evntly's version: **one city, a few categories, and Mohnish personally making the first 50 vendors
successful** before asking the next 150 to trust us.

---

## 0. North-star metric and the honest starting point

**Active vendor** = approved + complete (3 photos, 1 package) + received at least one *genuine* enquiry in
the last 60 days + responded to it.

| Today (24 Nov) | |
|---|---|
| Approved | 12 |
| Completed | 8 |
| Received a genuine enquiry | **0** |
| Active vendors | **0** |

Weekly review number: **active vendors**, then *genuine enquiries delivered*, then *completed listings*.
Not landing visitors, not sign-ups. All three are now on Admin → Vendor drafts (once the migration is applied).

## 1. Fix the demand problem for the vendors we already have (weeks 1–4)

Adding vendors to a marketplace with no enquiries burns the trust we need for the next ones. The 8
complete vendors are the first "hosts in New York".

1. **Concierge matching (do it by hand).** For every real customer planning an event (the 14 customer
   accounts, the 10 events in the planner, friends-of-friends, local community groups *where posting is
   allowed*), Mohnish personally suggests 2–3 Evntly vendors and helps them send a quote request *through
   Evntly*. Target: **1 genuine enquiry for each of the 8 complete vendors by 22 Dec.**
2. **Pick a beachhead.** Weddings and milestone birthdays in Western Sydney / Parramatta (or wherever the
   8 vendors cluster) — one event type, one region, so a customer finds enough vendors to compare.
3. **Tell vendors the truth weekly.** A short personal note: views of their profile, enquiries sent, what
   we're doing next. Vendors stay for honesty more than for numbers.
4. **Ask each vendor for one introduction** to a customer who's planning something (not a review, not a
   referral fee — an introduction). This is the cheapest demand Evntly will ever get.

## 2. Personal outreach for supply (weeks 1–12)

Data: Instagram DM and direct outreach convert to Claim at 13–17% and produced all 8 completed listings;
Meta ads converted at 1.9% and produced none. **Pause scaling ads until vendors are getting enquiries**
(a recommendation only — no ad change has been made).

| Week | Activity | Target |
|---|---|---|
| Every week | 25 personal, researched DMs/emails (via `evntly-lead-finder` → `evntly-outreach-drafter`; Sai approves and sends each) to vendors in the beachhead categories/region | 4–5 conversations |
| Every week | 5 **assisted listings**: with the owner's yes, prepare their private draft (Admin → Vendor drafts), send the claim link personally | 3 claimed |
| Every week | 2 in-person or video **vendor interviews** (script below) | 2 interviews |
| Fortnightly | Visit one place vendors gather (a wedding expo, a supplier meet-up, a venue open day) — introduce yourself, don't pitch, take notes | 5 new conversations |

Rules that keep it trustworthy: never list a business without the owner's yes; never copy photos from
competitor directories; the owner reviews and approves every word; one follow-up maximum.

## 3. Assisted listing creation (the "we'll take the photos" move)

Airbnb rented a camera. Evntly's version:

1. Owner says yes (DM, call, in person). Record it in Admin → Vendor drafts: *who, how, when*.
2. Draft the listing from the owner's own Instagram/website and words — category, suburb, events,
   starting price they told you, a description in their voice. Packages stay unpriced until they set them.
3. Copy the claim link (shown once) and send it personally: *"Here's the draft we talked about — change
   anything, it's private until you submit it."*
4. They confirm their email, add their ABN, accept the agreement, tick "add the photos I sent you". You add
   the photos through Setup requests; they submit; you approve.
5. **Within 7 days, send them their first genuine enquiry** (section 1). That's the moment they become a
   promoter.

## 4. Vendor interview script (20 minutes, notes in `outreach/interviews/` — local only)

1. Where do your bookings come from today? What does each cost you?
2. Walk me through the last enquiry you turned down. Why?
3. What's annoying about Easy Weddings / Bark / Facebook groups / Instagram DMs as a source of work?
4. What would make an enquiry from Evntly worth replying to within an hour?
5. What would you need to see before you'd trust a new platform with your name?
6. Who's one other vendor you'd recommend, and would you introduce us?

Log the answers; review all interviews monthly. Change the product only on patterns, not single anecdotes.

## 5. Referral opportunities (light, honest)

- **Vendor-to-vendor introductions:** after a vendor's first genuine enquiry, ask for one introduction.
  Track with the existing `ref` codes. No cash incentive yet — the incentive is "your florist friend
  gets the same Founding badge you got".
- **Cross-category bundles:** a photographer + florist + DJ who already work together, listed together,
  make the beachhead feel full to customers.
- **Share-profile loop:** every approved vendor gets their profile link and QR for their Instagram bio
  (`/vendor-dashboard/share`), which brings customers *and* other vendors.

## 6. 90-day targets (realistic, not hopeful)

| By | Approved | Completed | Active (genuine enquiry) |
|---|---|---|---|
| 22 Dec 2026 | 20 | 14 | 8 |
| 31 Jan 2027 | 40 | 30 | 20 |
| 28 Feb 2027 | 70 | 55 | 35 |

Path to 200 approved active vendors: repeat the beachhead in a second and third region once 60% of
vendors in the first get a monthly enquiry. Only then reconsider paid acquisition, starting with
retargeting landing-page visitors who began a draft.

## 7. What needs Sai's approval

1. Applying migration `20261130090000_vendor_listing_drafts` (production DB).
2. Merging and deploying the PR.
3. Pointing Instagram bio / DMs to `/become-a-vendor` (and later the ads — no ad changes made).
4. Each outreach message, each assisted draft, and each claim link before it's sent.
5. Setting `ANTHROPIC_API_KEY` if Claude-written suggestions are wanted (otherwise the built-in writer runs).
