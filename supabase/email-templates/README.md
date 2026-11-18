# Supabase Auth email templates

Paste these in **Supabase dashboard → Authentication → Emails → Templates**
(project `pzeosxtdulveuywhmkfe`), **after** the PR that adds `/auth/confirm`
is deployed. Until then, keep the current templates.

## Why the links changed (18 Nov 2026)

Email security scanners (common on business email such as snap.com.au) open
every link in a message the moment it arrives. The old links used the
one-time token on that first open, so the vendor's own tap and their 6-digit
code both said "expired". The new links go to `/auth/confirm`, which only
uses the token when the person presses **Continue**. They also work on any
device; the old reset link only worked in the browser that asked for it.

`{{ .RedirectTo }}` is placed last on purpose: it carries our `next` path
(e.g. `/founding-vendors/claim`), which `/auth/confirm` reads.

## Confirm signup

Subject: `Confirm your Evntly account`

```html
<h2>Confirm your email</h2>
<p>Enter this code on Evntly to finish signing up:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
<p>Or tap the button, then press <strong>Continue</strong>:</p>
<p><a href="https://evntlyapp.com/auth/confirm?token_hash={{ .TokenHash }}&type=signup&redirect_to={{ .RedirectTo }}">Confirm my email</a></p>
<p>If you didn't sign up for Evntly, you can ignore this email.</p>
```

## Reset password

Subject: `Reset your Evntly password`

```html
<h2>Reset your password</h2>
<p>Tap the button, then press <strong>Continue</strong> to choose a new password. It works on any phone or computer.</p>
<p><a href="https://evntlyapp.com/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&redirect_to={{ .RedirectTo }}">Reset my password</a></p>
<p>If you didn't ask to reset your password, you can ignore this email.</p>
```

## Check after pasting

1. Sign up with a test email: the email shows a code and a button; the
   button opens a page with **Continue**; pressing it lands on the listing
   form (vendors) or the home page.
2. Forgot password from a laptop, open the email on a phone: **Continue**
   opens the new-password form on the phone.
3. Old links still work: `/auth/callback` is unchanged.
