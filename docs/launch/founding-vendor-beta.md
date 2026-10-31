# Founding vendor beta: launch checklist

Branch `founding-vendor-beta`. Nothing here is live until each step below is approved and done.

## How it works

1. A vendor opens `/founding-vendors` (from Instagram, a DM, the waitlist email or direct outreach; the UTM source is remembered in a cookie that holds only the source name).
2. **Claim Your Free Vendor Account** → `/founding-vendors/claim`.
   - Signed out: *Create my free vendor account* (`/signup?role=vendor&next=…`) or *I already have an account* (`/login?next=…`). Email confirmation returns them to the claim page.
   - Signed in: one tap claims a place (`claim_founding_vendor_place`, one application per account). Existing vendors apply with their existing listing and never register again.
   - No listing yet: the existing `/vendor-signup` wizard. Submitting it moves the application to *Pending* (DB trigger), emails the vendor and admins, and returns to the claim page.
3. The claim page shows the status: Not submitted yet / Pending / Approved / Needs changes / Not approved / Withdrawn.
4. Admin → **Beta Vendors** (`/admin/beta-vendors`): *Approve listing + place* approves the listing, marks it Founding and emails the vendor, all in one transaction under a lock, so approvals can never go past capacity. *Needs changes* (with a note) and *Reject* email the vendor too.
5. Approved vendors get `/vendor-dashboard/beta`: a welcome message, a checklist and a feedback/bug form. Feedback shows up in the admin page.
6. When places are full, the landing page switches to **Join the Waitlist**. Normal vendor signups outside the beta aren't affected.

## Invitations

- Import the waitlist as a CSV in Admin → Beta Vendors → Import. **Only rows with `invite_consent` = yes can be invited.** Also fill in `consent_note` with where they opted in (e.g. "Tally waitlist form, Sept 2026").
- Each link has 256 bits of randomness. Only its SHA-256 is stored. Links expire (default 14 days) and resending replaces the old link.
- A link only links the application to the contact for tracking (sent → opened → clicked → claimed). It grants nothing. If someone signs in with a different email, the link isn't attached and they apply normally.
- Real sends are blocked unless `BETA_INVITES_LIVE=true`. The database also refuses: contacts without consent, unsubscribed contacts, people who already applied, a second send while one is in flight, a resend within 24h, and anything over the rolling 24h limit (default 50). Each Resend call carries an idempotency key. A rate-limit or quota error stops the batch.
- Every invitation has a sender identity (Sai Mohnish Golem trading as Evntly, ABN, contact email), says why it was sent, and has an unsubscribe link plus RFC 8058 one-click headers. Spam complaints and bounces unsubscribe the contact automatically (once the webhook is set up).

## Steps that need your approval (in order)

1. **Review the PR.**
2. **Apply the migration** `supabase/migrations/20261101090000_founding_vendor_beta.sql` to production (new tables and functions only, plus one AFTER INSERT trigger on `service_providers`). Rollback: `supabase/rollbacks/20261101090000_founding_vendor_beta.down.sql`. Then regenerate `database.types.ts` (the beta types were added by hand).
3. **Merge and deploy.** The landing page goes live and shows the real places counter. Sending stays off.
4. **Vercel env vars** (Production):
   - `BETA_EMAIL_FROM` (optional), e.g. `Mohnish from Evntly <hello@evntlyapp.com>`. Without it, `EMAIL_FROM` is used. evntlyapp.com is already verified in Resend (DKIM/SPF/DMARC).
   - `RESEND_WEBHOOK_SECRET`: create a webhook in Resend → Webhooks pointing at `https://evntlyapp.com/api/resend/webhook` (events: delivered, delivery_delayed, bounced, complained, failed, opened, clicked). Turn on open/click tracking for the domain if you want opens counted.
   - Leave `BETA_INVITES_LIVE` **unset** for now.
5. **Check limits.** In the Resend dashboard, check your plan's daily/monthly quota (the free plan is 100/day and 3,000/month, shared with all app emails) and set *Max invitations per 24h* below it. Supabase Auth confirmation emails go through Resend SMTP too: check Auth → Rate limits → "emails sent per hour" is above the number of signups you expect in an hour.
6. **Privacy policy.** It covers marketing emails to account holders, but not waitlist contacts without an account. Add a sentence on the vendor waitlist (what is collected, why, how to unsubscribe) and run it past your solicitor with the other drafts.
7. **Import the waitlist CSV** and check the consent counts on the admin page.
8. **Send a test email** (*Send test email to me*). Check it in Gmail and Outlook (inbox, not spam), that the button opens the claim page and that Unsubscribe works.
9. **Approve the real campaign.** Set `BETA_INVITES_LIVE=true` and redeploy. Then send a small batch first (e.g. 5), watch delivery on the admin page, then the rest in batches.
10. **Instagram.** Copy the share links from Admin → Beta Vendors → Share links (bio, Stories, DMs, outreach).

Online payments stay off (`app_settings.payments_enabled = false`); nothing in this branch changes that.
