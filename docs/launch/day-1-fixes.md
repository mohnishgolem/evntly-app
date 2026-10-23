# Day 1 fixes: 23 October 2026

Launch: 31 October 2026. Branch: `day1-fixes` (from `main`, **not committed, not pushed, not deployed**).

Nothing was changed in production: no database migrations, no permission changes, no environment variables, no deploys. The only things written to production were one password-reset email to our own test inbox and a rolled-back SQL test (verified to leave no rows behind).

## Summary

| # | Issue | Status |
|---|-------|--------|
| 1a | Auth emails use Resend custom SMTP | **Verified working**, no change needed |
| 1b | Sign-up confirmation link leaves people signed out | **Fixed on branch**, awaiting deploy approval |
| 1c | Expired/used email links show no message | **Fixed on branch**, awaiting deploy approval |
| 1d | Auth email hourly limit | **Needs you** (Supabase dashboard) |
| 1e | Fresh registration test | **Needs you** (I can't create accounts) |
| 2 | Vercel access denied | **Resolved**: team access approved 23 Oct; env names and logs reviewed |
| 3a | `ADMIN_MFA_OPTIONAL` in production | **Verified absent** in every environment |
| 3b | 3 helper functions callable while signed out | **Reviewed, no change**: revoking would break public pages |
| 3c | 40 privileged functions | **Reviewed**: all check the caller; 2 low-risk notes |
| 4 | Demo (sample) vendor listings | **Fixed on branch**, awaiting deploy approval + your hide/show decision |
| 5 | End-to-end booking flow | **Passed** at database level (22/22); browser run needs test logins |
| 6 | Verification | 268/268 tests, type check, lint, build all pass |

---

## Completed (verified, no deploy needed)

### 1a. Auth email delivery through Resend

- **Initial problem:** The audit couldn't tell whether Supabase Auth used its built-in mailer, which only sends a few emails an hour.
- **Root cause:** Not a fault; the setting wasn't visible to the audit tools.
- **Fix implemented:** None needed.
- **Evidence:**
  - Password reset requested on the live site at 21:22:18 UTC for `mohnish+evntlye2e@evntlyapp.com`; the email arrived the same second.
  - Sender `Evntly <hello@evntlyapp.com>`, sent through Resend (Amazon SES ap-northeast-1).
  - Gmail's checks: **DKIM pass** (`d=evntlyapp.com`, selector `resend`), **SPF pass** (`rsend.evntlyapp.com`), **DMARC pass**.
  - DNS: `resend._domainkey`, `rsend` MX/SPF and `_dmarc` records all present. Root MX is Google Workspace.
  - The reset link goes to `https://evntly-tau.vercel.app/auth/callback?next=/reset-password`. Opening it in the same browser landed on **Set a new password**. I didn't set a password.
  - Reusing the link is refused (`otp_expired`), so links are single-use.
- **Files changed:** none.
- **Remaining risks:**
  - DMARC is `p=none`, which only monitors. Move to `p=quarantine` after launch once reports look clean.
  - The forgot-password form took about 8 seconds to respond. That's acceptable, but worth watching.
- **Production deployment required:** No.

### 3b. Three helper functions callable while signed out

- **Initial problem:** Supabase flags `is_admin()`, `owns_service_provider(text)` and `is_active_combined_package(text)` as executable by signed-out (`anon`) callers.
- **Root cause:** They are row-level-security helpers. 37 access policies on public tables call them, including the policies that let signed-out visitors read vendor listings, portfolios, packages, bundles and event listings. Postgres requires the caller to have EXECUTE on any function a policy uses.
- **Fix implemented:** None, deliberately. Revoking `anon` EXECUTE would make Explore, vendor profiles and Bundles fail for signed-out visitors.
- **What they reveal:** `is_admin()` and `owns_service_provider()` only answer about the caller, so a signed-out caller always gets `false`. `is_active_combined_package()` says whether a bundle is active, which is already public.
- **Tests performed:** Read every function body. Listed the policies that use them (`pg_policies`). Called `/rest/v1/rpc/is_admin` signed out and got `false`.
- **Remaining risks:** Low. A cleaner long-term design moves helpers into a non-exposed schema, but that isn't worth the risk before launch.
- **Production deployment required:** No.

### 3c. The 40 privileged (SECURITY DEFINER) functions

- **Initial problem:** 40 functions run with elevated rights and any signed-in user can call them.
- **Review method:** Pulled every definition from production and checked how each one checks its caller.
- **Result:** None is missing caller authorisation.
  - **Admin functions (10):** `admin_*` either raise `Not authorized` or filter on `is_admin()`. `is_admin()` requires the admin role **and** a two-factor (`aal2`) session.
  - **Party functions:** `accept_quote`, `accept_event_application`, `book_bundle`, the payment-plan and milestone functions, and the dispute functions all lock the row to `auth.uid()` as customer, vendor or admin, and raise otherwise.
  - **Reader functions:** `my_*`, `conversation_messages`, `attachment_readable` and `conversation_block_state` return only the caller's own rows. `my_quote_requests` also blanks both parties' emails.
- **Two low-risk notes, no change made:**
  1. `matching_settings()` shows any signed-in user the matching weights. They aren't sensitive.
  2. `booked_vendor_ids_on(date)` and `vendor_busy_slots(from, to)` show any signed-in user which vendors are booked on a date or within a window of up to 3 days. That's needed for availability matching, but it exposes vendor schedules (no customer data). Revisit if vendors object.
- **Production deployment required:** No.

### 5. End-to-end booking flow (database level)

- **Initial problem:** Signed-in journeys had never been tested end to end.
- **Method:** `supabase/tests/e2e_booking_flow.sql` runs as the real roles (`authenticated` with each user's JWT claims, then `anon`) inside one transaction that always rolls back.
  - Accounts used are existing test accounts: a test customer, the test vendor's "QA Vendor Agent" listing (approved inside the transaction only), and an unrelated test customer as the outsider.
  - No database trigger makes network calls, so no emails were sent.
- **Result: 22/22 passed.**
  1. Customer search finds the photographer.
  2. Quote request is created and routed to the vendor.
  3. The outsider can't read or change it.
  4. The vendor sees it and quotes $1,500.
  5. The outsider can't accept it.
  6. The customer accepts and a booking is created (`pending`).
  7. The customer sends a message.
  8. The vendor confirms the booking, reads the message, replies, and sees the booking.
  9. The customer sees `confirmed` and both messages.
  10. The outsider can't read the booking, cancel it, read the messages (by RPC or table), or post into the conversation.
  11. A signed-out caller can't read the booking or the messages.
- **Rollback verified afterwards:** the QA listing is still `suspended`, quote count is still 7, bookings still 2, and there are no new messages.
- **Not covered:**
  - The browser UI for these steps. I can't sign in as the test accounts because entering passwords is off-limits for me.
  - Emails sent by the app's server actions.
  - Stripe, which is off.
- **Production deployment required:** No.

---

## Awaiting your approval (on branch `day1-fixes`, not deployed)

### 1b. Sign-up confirmation leaves people signed out

- **Initial problem:** The confirmation email (sample from 11 Oct) links to `…/verify?…&redirect_to=https://evntly-tau.vercel.app`, the bare home page.
- **Root cause:** `signUp()` passed no `emailRedirectTo`, so Supabase used the Site URL. Supabase adds a one-time `?code=` to that URL, but only `/auth/callback` exchanges codes for a session. People ended up confirmed but signed out, with no message, and had to find Log in themselves.
- **Fix implemented:** Sign-up now sets `emailRedirectTo` to `/auth/callback?flow=signup&next=/dashboard` (`/vendor-signup` for vendors). The origin comes from the existing trusted-origin check, never from request headers.
  - Someone who opens the link in a different browser can't be signed in automatically, because the one-time code only works in the browser that signed up. Their email is still confirmed, so they now land on Log in with "Your email is confirmed. Log in to continue."
- **Files changed:** `src/lib/actions/auth.ts`, `src/app/auth/callback/route.ts`, `src/lib/auth-notices.ts` (new), `src/app/(auth)/login/page.tsx`
- **Tests performed:** `tests/unit/auth-email-links.test.ts` (new) uses the real Supabase client with a faked network. It asserts the exact `redirect_to` sent to Supabase Auth, that an untrusted `Origin` header is ignored, and the callback outcomes. The existing callback tests still pass.
- **Result:** Passes. The login notice was checked in the local preview.
- **Remaining risks:**
  - If `https://evntly-tau.vercel.app/auth/callback` isn't in Supabase Auth → URL Configuration → Redirect URLs, Supabase falls back to the Site URL, which is today's behaviour, so nothing gets worse. The password-reset link already uses `/auth/callback` successfully, so the allow-list very likely covers it.
  - Needs one real sign-up after deploy to confirm (see 1e).
- **Production deployment required:** Yes (code only).

### 1c. Expired or reused email links show no message

- **Initial problem:** The callback sent failures to `/login?error=Could not sign in.`, but the login page never showed `error`, so people saw a plain login form.
- **Fix implemented:** The callback now sends a fixed key (`email-confirmed`, `link-expired` or `signin-failed`) and the login page shows the matching message. The expired-link message includes "Request a new password reset link". Only known keys render, so a crafted URL can't put its own text on the page.
- **Files changed:** same as 1b.
- **Tests performed:** Unit tests for each outcome, including rejection of unknown keys like `<script>` and `toString`. Visual check of `/login?notice=link-expired` locally.
- **Production deployment required:** Yes (code only).

### 4. Demo (sample) vendor listings

- **Initial problem:** All 14 approved listings are seeded samples (`is_demo = true`, no owner account). The other 2 listings are QA test listings, already suspended.
  - **Customers can request quotes from samples today:** 5 of the 7 quote requests in production went to sample listings and all expired unanswered. The profile warned "quote requests to it won't be answered" but still showed the buttons.
  - Expired-request emails could also suggest sample listings as "other vendors you could ask".
- **Existing safeguards:** Samples are badged, kept out of search engines and the sitemap, sorted below real vendors, and excluded from smart matching.
- **Fix implemented:**
  1. **Always on:**
     - Sample profiles replace "Contact" and "Request a quote" with a short note.
     - The `requestQuote` and `sendMessage` server actions refuse sample listings.
     - "Similar vendors" emails never suggest them.
  2. **Switch:** `HIDE_SAMPLE_LISTINGS=true` (Vercel environment variable) removes samples from home, Explore (list and map), Bundles and similar-vendor suggestions. Sample profile pages then 404 for everyone except admins, with the vendor name removed from the page title too.
  3. **Records preserved:** nothing is deleted or changed in the database.
- **Files changed:** `src/lib/sample-listings.ts` (new), `src/lib/data/vendors.ts`, `src/lib/data/bundles.ts`, `src/lib/actions/quotes.ts`, `src/lib/actions/messages.ts`, `src/app/vendor/[id]/page.tsx`
- **Tests performed:**
  - `tests/unit/sample-listings.test.ts` (new): real client with a faked network, checking the `is_demo=eq.false` filter on each query with the switch on and off, plus the quote refusal. Confirmed that 3 of these tests **fail without the fix**.
  - Production build run locally with `HIDE_SAMPLE_LISTINGS=true`: `/`, `/explore` and `/explore?category=photographer` returned 200 with no sample vendors; a sample profile returned 404 with no name in the page.
  - With the switch off, Explore still lists them.
  - The local preview showed the new note on a sample profile.
- **Remaining risks:**
  - **With the switch on and no real vendors, Explore and home will be empty.** Turn it on only once real vendors are approved, or keep samples visible (now safely uncontactable) until then.
  - Changing the switch needs a redeploy, because the home page is pre-rendered.
  - The database still accepts a quote insert to a sample listing if someone bypasses the app. That's harmless (it just expires), but a database trigger could block it. I haven't written one; it would be a permission change needing your approval.
- **Production deployment required:** Yes (code). Setting the switch is a separate decision.

---

## Needs action from you

### 2. Vercel access denied: resolved

- **Root cause:** The Evntly project belongs to your personal Vercel team `mohnishgolems-projects` (`team_xekFo86WilLylobOEZPtA6Ad`), and the Claude connection had never been granted that team. The first approval links expired before use; each lasts 10 minutes.
- **Fix:** You approved team access on 23 Oct. No project permission changes were needed.
- **Production env var names** (values were not read or decrypted):
  - **Used by the app:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sensitive), `RESEND_API_KEY` (sensitive), `EMAIL_FROM`
  - **Added by the Supabase–Vercel integration on 22 Oct, and not used by the code:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`
  - **Not set:** `ADMIN_MFA_OPTIONAL` (good), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` (consistent with payments being off), `HIDE_SAMPLE_LISTINGS`
  - **Preview and Development** have only the two public Supabase values. Preview builds therefore send no email, and their rate limiting fails open. That's fine for previews.
  - Vercel reports no security issues on any variable.
- **Runtime errors, last 7 days:**
  - 137 × "Functions cannot be passed directly to Client Components" on `/dashboard`, `/admin`, `/admin/customers`, `/messages` and `/dashboard/events/[id]`, between 05:09 and 09:33 UTC on 21 Oct. **None since**, so it was fixed by that day's deploys.
  - 14 × error-alert emails refused by Resend ("10 requests per second") during that same burst. See risk below.
  - 2 × attachment scan failures (`Cannot find module 'bmp-js'`, then a timeout) on 19 Oct. The file-tracing fix shipped 20 Oct and there have been none since, but no attachment has been uploaded since, so it's **not yet re-verified**.
- **Remaining risks:**
  1. **Unused high-privilege secrets.** The database password, connection strings, JWT secret and secret key sit in the production runtime but the app never reads them. They're not exposed to browsers (none is `NEXT_PUBLIC_` except the publishable key, which is public by design). Still, any server-side leak would reveal more than it needs to. **Your call:** keep them if you plan to use the integration, otherwise remove them in Vercel → Settings → Environment Variables. Removing env vars is a production change, so I haven't touched them.
  2. **Error alerts can flood Resend.** `src/lib/error-report.ts` checks for a recent alert and then inserts, so simultaneous errors each send an email. On 21 Oct this hit Resend's 10/second limit. Auth emails (sign-up confirmation, password reset) use the same Resend account, so an error storm during launch could delay them. **Suggested Day 2 fix:** claim one alert per error per day atomically in the database, which needs a small migration and your approval.
  3. Upload a test photo in Messages after the next deploy to confirm the attachment scanner works.
- **Production deployment required:** No.

### 1d. Auth email hourly limit

When you use custom SMTP, Supabase defaults to **30 auth emails per hour**. A launch spike can exceed that, and sign-ups then fail with a rate-limit error. I can't read this setting.

**Action:** Supabase dashboard → Authentication → Rate Limits → raise "emails sent per hour" (for example to 150). Resend's plan limit is the real ceiling, so check it too.

### 1e. Fresh registration test

I'm not allowed to create accounts, so please do this once the fixes are deployed:

1. In a private window, sign up at `/signup` with a new `mohnish+launch1@evntlyapp.com`.
2. Open the confirmation email **in the same browser**. You should land on `/dashboard`, signed in.
3. Repeat with a second address, opening the email on your phone. You should land on Log in with "Your email is confirmed."

I'll then check the auth logs and the email headers.

### 5 (UI). Browser run of the booking flow

The database flow passes. For a UI pass, sign the browser pane into the test customer and the test vendor yourself, or tell me which test accounts I may use once you've signed them in. I'll then drive search → quote → respond → accept → confirm → message on desktop and phone widths.

---

## Verification (after all changes)

| Check | Result |
|-------|--------|
| `npm test` | 39 files, **268/268 pass** (256 before + 12 new) |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no warnings |
| `npm run build` | Pass |
| Local preview | Sample profile shows the note and no quote button; login notices render |
| Regressions found | None |

## To deploy (when you approve)

1. Review the diff on `day1-fixes`. I commit and push only when you say so.
2. Merge to `main`. Vercel deploys production automatically.
3. Optional: set `HIDE_SAMPLE_LISTINGS=true` in Vercel Production when real vendors are live, then redeploy.
4. Run the registration test in 1e.
