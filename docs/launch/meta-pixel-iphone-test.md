# iPhone test: vendor sign-up inside Instagram + Meta CompleteRegistration

Run this once, after PR #46 is merged and deployed **and** the Vercel env has `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_META_PIXEL_ENABLED=true`, `META_CAPI_ACCESS_TOKEN` and `META_CAPI_TEST_EVENT_CODE` (from Events Manager → your dataset → Test events). It creates one real vendor account (yours, as a test), which is deleted afterwards. No ads need to be running.

## Before you start (laptop)
1. Open **Events Manager → Evntly website → Test events** and leave it open. Note the test code shown there; it must match `META_CAPI_TEST_EVENT_CODE`.
2. Tell Claude "starting the test" so the database baseline is recorded.

## On your iPhone
1. In Instagram, send yourself (or a close friend) this link in a DM, then tap it so it opens **inside Instagram**:
   `https://evntlyapp.com/founding-vendors?cat=photographer&utm_source=meta&utm_medium=paid_social&utm_campaign=fv_v3_web&utm_content=qa_pixel_test`
2. If you're signed in to Evntly in that browser, open the menu → **Log out**, then tap the link again. You should see "Already on Evntly? Log in".
3. The **ad measurement banner** appears at the bottom. Tap **Allow**.
   - On the laptop, Test events should show **PageView** (Browser) within a minute.
4. Tap **Claim my free listing**. The sign-up form opens with **no Google button** and an "email only inside Instagram" note.
5. Sign up as a vendor with a **fresh throwaway email** you can open on the phone (e.g. `yourname+pixeltest1@gmail.com`) and a throwaway password. Tick the agreements.
6. Open the email "Confirm your Evntly account" and **type the 8-digit code** into the page. Don't tap the link in the email.
7. You should land on the **Founding Vendor claim page, signed in, still inside Instagram**.

## What should happen
- Events Manager → Test events: **one CompleteRegistration**, received from **Browser and Server**, marked **Deduplicated** (one count). Event ID starts with `reg_`.
- Expand the server event: `user_data` shows only IP address, user agent and `fbp` (no email, phone or name).
- Claude checks the database: new vendor account confirmed; funnel steps Claim tap, sign-up form opened, sign-up attempt, account created and **email confirmed (code)**, all with source `meta_ads` and campaign `qa_pixel_test`.

## If something goes wrong
| What you see | Likely cause |
|---|---|
| No banner | Env not set on the deploy, or the browser has Do Not Track on |
| No PageView in Test events after Allow | Pixel ID mismatch, or Instagram's browser blocked connect.facebook.net (retry once) |
| CompleteRegistration from Server only | Browser pixel not ready within 5 s; still counted once by Meta |
| Two CompleteRegistration rows not deduplicated | Event IDs differ: tell Claude immediately |
| No email / code rejected | Wait 60 s and tap "Send a new code" |

## Afterwards
- Tell Claude "done". Claude verifies the database, then (with your OK) deletes the test account and marks the test rows.
- Remove `META_CAPI_TEST_EVENT_CODE` from Vercel before launching ads (or test events keep appearing only in Test events).
