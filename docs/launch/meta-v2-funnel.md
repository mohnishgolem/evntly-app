# Meta Ads V2 funnel fixes: deploy notes

PR branch `meta-v2-funnel`. Nothing here is live until Sai approves each step.

## What changes for a vendor
1. **"Claim my free listing" goes straight to the vendor sign-up form** for signed-out visitors (the claim page in between is skipped). Signed-in visitors and invite links still use the claim page.
2. **Sign-up confirmation by code.** After "Sign up", the form asks for the code from the confirmation email. Typing it confirms the email *in the same browser*, so a vendor inside Instagram's or Facebook's built-in browser stays signed in. The email link still works as before.
3. **Founding page:** the first screen says what Evntly is, `?cat=photographer|videographer|dj|decorator|planner` swaps in a headline matching each Meta V2 ad, the free terms sit under the button, the badge preview uses a labelled sample listing photo, there's a "Prefer some help?" form, and a short "who runs Evntly" note.
4. **Admin "Mark founding"** now refuses once the Founding Vendor capacity (200) is used up, like approvals through the beta.
5. **Privacy policy:** new paragraphs on vendor waitlist, help-request and Meta ad-form contacts (what, why, 12-month retention), and on the page-view source.

## Deploy order (each step needs Sai's OK)
1. **Supabase email template** (Dashboard → Authentication → Emails → "Confirm signup"): add the code. Until this is done the code box can't work, and vendors fall back to the link. Suggested body:

   ```html
   <h2>Confirm your Evntly account</h2>
   <p>Your code is:</p>
   <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   <p>Type it on the sign-up page to finish. Or <a href="{{ .ConfirmationURL }}">confirm by link</a> (it may open a different browser; log in there with the same password).</p>
   <p>If you didn't sign up for Evntly, ignore this email.</p>
   ```
   Check Authentication → Providers → Email: "Email OTP length" (currently 8; the form accepts 6–10 digits) and "Email OTP expiration" (currently 3600 s; keep at 1 hour or less).
2. **Migration** `supabase/migrations/20261115090000_meta_v2_funnel.sql` (additive: two nullable/defaulted columns, one constraint widened, `admin_funnel` steps 115–116). Rollback: `supabase/rollbacks/20261115090000_meta_v2_funnel.down.sql`. Tested offline in PGlite (`tests/sql/meta-v2-funnel.test.ts`), never against production.
3. **Merge + deploy** the PR. The code is safe if it lands before the migration for everything except the new events and the help form (those inserts would fail quietly until the migration is applied), but apply the migration first.
4. **Signup test on a throwaway account** (Sai's OK needed, because it creates a real account): on an iPhone, open a tagged link inside Instagram, sign up as a vendor, type the code, check you land on the claim page signed in, then check `admin_funnel` steps 115/111/113/116 and delete the test account.

## Privacy decision for Sai
The privacy-policy edit adds information about people who aren't Evntly users (waitlist and ad-form contacts) and doesn't change anything for account holders, so it doesn't bump `LEGAL_VERSIONS.privacy_policy` (a bump makes every user re-accept and blocks quotes/messages until they do). If you or your solicitor treat it as a material change, bump the version and add the `legal_document_versions` migration before deploying.

## Security review (auth change)
- **Code guessing:** the project sends 8-digit codes (checked 14 Nov) = 100,000,000 combinations. Our limits: 8 tries per email and 30 per IP per 15 minutes, on top of Supabase's own. At the 1-hour expiry that's at most ~32 guesses per code (~0.00003%).
- **Code bound to the email:** `verifyOtp({ email, token, type: "email" })` only signs in the account the code was sent to.
- **No account enumeration:** a wrong code and an expired code get the same message; "Send a new code" reports success for any address and only surfaces rate limits or outages.
- **Redirects:** `next` passes through `safeNextPath`, and vendors without a founding path go to `/vendor-signup`. Tested with `//evil.example/x` and `https://evil.example`.
- **Email links:** resend uses the same `appOrigin()` allow-list as sign-up, so a spoofed Origin header can't put another domain in the email (tested).
- **CSRF:** server actions only (Next.js checks Origin for actions).
- **Funnel events:** `signup_view` is browser-sent like `claim_click`, so it can be inflated, but it's rate-limited and holds no personal data. `email_confirmed` is server-only.
- **Help form:** the Instagram/website text is stored as plain text (≤120 chars) and shown escaped in Admin, never as a link.
- **Rate limiter fails open** if its RPC is unavailable (existing design, so a fault never locks people out). Supabase's own verify limits still apply in that case.
