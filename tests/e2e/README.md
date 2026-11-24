# Isolated browser QA (no production access)

These scripts drive real Chrome against a **local** dev server whose Supabase
URL points at `mock-supabase.mjs`, an in-memory stand-in for the REST/Auth API.
Nothing here can reach the production database, Vercel or Meta: every
request that isn't to localhost or the mock is aborted.

1. `node tests/e2e/mock-supabase.mjs` (port 54399). Sample listings (all
   `is_demo`, no reviews), one test customer, an upcoming event and a booking.
   Optional photos: set `FIXTURE_DIR` to a folder with a `photos/` subfolder.
2. Start the dev server on port 3100 with:
   `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=isolated SUPABASE_SERVICE_ROLE_KEY=isolated-mock NEXT_PUBLIC_META_PIXEL_ID=1234567890 NEXT_PUBLIC_META_PIXEL_ENABLED=true STRIPE_SECRET_KEY=sk_test_isolated npm run dev -- -p 3100`
   (the pixel id is fake; Meta requests are blocked by the scripts).
3. `node tests/e2e/signed-in.mjs [screenshot dir]` — tab bar, unread badge,
   Continue planning, Recently viewed, save/unsave across sessions, event
   board, messages, profile, sign-out.
4. `node tests/e2e/consent.mjs [screenshot dir]` — ad-consent banner placement,
   No thanks / Allow / GPC, nothing sent to Meta before Allow.

Restart the mock between runs to reset its state. Browsers use a normal
iPhone Safari user agent because `/api/track` ignores headless browsers.
