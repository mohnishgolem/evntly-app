# Launch checklist and issue log

Launch: 31 October 2026. Last updated 23 October 2026.

Status: **Done** = verified with evidence · **Partly** = some of it verified · **Open** = not started or not verified · **Owner** = who has to act.

## P0: must be done before launch

| # | Item | Status | Owner | Evidence / next step |
|---|------|--------|-------|----------------------|
| 1 | Connect evntlyapp.com to Vercel with HTTPS | Done | — | Live 23 Oct: HTTPS certificate valid, www and http redirect to https://evntlyapp.com, email records untouched. Emails, sitemap and share links use the new address. Password reset tested on the new address end to end. The old Vercel address still works. |
| 2 | Recruit and verify the first 5–10 Sydney vendors | Open | Sai | Every approved listing is still a sample. |
| 3 | Test customer registration end to end | Partly | Sai | Confirmation redirect fixed and deployed; one real sign-up still needed. |
| 4 | Test vendor registration and onboarding | Open | Sai | Sign up as a vendor, create a listing, approve it as admin. |
| 5 | Email sending limits | Decided | Sai | Launching on Resend Free (100 emails/day). Supabase auth limit stays at 30/hour. Check Resend usage daily during launch week; upgrade to Pro once a day passes about 60 sends, or before any promotion. |
| 6 | Payments decision | Partly | Sai | Payments are switched off and can't be switched on by users. Decide: launch without payments, or test Stripe in sandbox by 28 Oct. |

## Verified

| Item | Evidence |
|------|----------|
| Password reset | Live test 23 Oct: email arrived in about a second, SPF/DKIM/DMARC pass, link lands on Set new password, reused link refused. |
| Login and auth emails | Sent through Resend from the evntlyapp.com domain. |
| Role separation | Rolled-back database test (22/22): a third party can't read or change a booking, quote or messages. Every vendor page checks for a vendor on the server (automated test). Admin requires two-factor. |
| Data protection (RLS) | RLS is on for every table. Signed-out reads of users, quotes, messages, bookings, payments and disputes return nothing. All 40 privileged functions check the caller. |
| No secrets in the website code | The live site's JavaScript (20 files, about 1 MB) contains no secret keys or service-role tokens. `ADMIN_MFA_OPTIONAL` isn't set. |
| Payment status can't be faked | Rolled-back test: a customer can't change payment status or confirm their own booking, nobody can mark a payment funded directly, users can't switch payments on. |
| Legal pages | Terms and Privacy pages load and cover cancellations; links are in the footer and on sign-up. |
| Business identity | ABN shown in the footer (checksum valid) with a Sydney location and support email. |
| Booking flow (database) | Search → quote → vendor price → accept → vendor confirms → messages: 22/22 pass. |
| Navigation | Customer and vendor five-tab navigation live, with the Messages button and notifications bell in the header. |

## P1: before or just after launch

| Item | Owner | Next step |
|------|-------|-----------|
| Support inbox receives mail | Sai | Send a test email to the support address from an outside account and confirm it arrives. |
| Click-through as a customer on phone and laptop | Sai | Search, open a vendor, request a quote, check Bookings, messages and the bell. |
| Click-through as a vendor | Sai | Edit listing, upload photos, set pricing and availability, reply to a request, confirm a booking. |
| Admin moderation | Sai + Claude | File a test report and handle it in Admin → Support. |
| Error alert emails can hit Resend's rate limit | Claude | Send one alert per error per day, enforced in the database (small migration, needs approval). |
| Remove unused database secrets from Vercel | Sai | 13 variables added by the Supabase integration aren't used by the app. |
| Sample listings | Sai | Set `HIDE_SAMPLE_LISTINGS=true` once real vendors are live. |
| Cancellation and refund sandbox tests | Sai + Claude | Only if payments launch. |
| Move DMARC from `p=none` to `p=quarantine` | Sai | After a week of clean reports. |

## Known limitations (not launch blockers)

- No guest list or separate planning checklist; no saved payment methods.
- Header counts update when a page loads, not instantly.
- One listing per vendor.
