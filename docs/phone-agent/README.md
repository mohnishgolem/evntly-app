# Evntly AI phone recruitment agent

Status (25 Nov 2026): **prototype approved (A$50 including setup). Built, tested offline and against the local Supabase stack; Retell not yet connected, nothing purchased, nothing deployed, no production migration.**
Draft PR: mohnishgolem/evntly-app#101. Setup steps for Sai: [SETUP.md](SETUP.md).

## What it does

Evntly's AI assistant phones Sydney event vendors **who have agreed to a call**, says straight away that it's an AI calling for Sai at Evntly, and then:

- personalises the pitch to the vendor's category (photographer, DJ, florist…);
- explains Evntly and the Founding Vendor benefits using only the facts on /become-a-vendor (free today, Founding badge and first in search, real-person review), and never promises bookings or quotes demand numbers;
- answers common questions (cost, demand, what's needed, how long) and handles objections once, politely;
- offers a free assisted listing (Sai prepares a draft for them to check);
- sends the registration link by SMS or email, **only after they say yes**, with the link tagged to the call (`?src=direct_outreach&c=aicall-<ref>`);
- books a callback with Sai, or warm-transfers to Sai during his transfer hours;
- stops immediately and permanently if asked not to be contacted;
- records the outcome, which updates the vendor outreach tracker, the growth dashboard and the acquisition spend.

## Provider choice: Retell AI + an Australian Twilio number

**Is Twilio needed? Yes.** Retell only sells US and Canadian numbers. It can call Australia from a US number (US$0.10/min), but then the caller ID would be American, which fails the Australian caller ID and return-call requirements (Standard s14). An Australian number has to come from a carrier over SIP (Retell has guides for Twilio, Telnyx and Vonage). Telnyx didn't publish Australian prices we could verify, so Twilio stays the choice.

**Costs (USD, official pages, Oct–Nov 2026; ≈A$ at 1.55):**

| Item | Price | A$ |
|---|---|---|
| Retell (voice infra 5.5¢ + ElevenLabs voice ~4¢ + Claude 5.5 Haiku, price not listed on Retell's page; Claude 4.5 Haiku is 2.5¢) | ≈12–14¢/min | ≈0.19–0.22/min |
| Twilio SIP to an AU mobile | 7.1¢/min | 0.11/min |
| **Call total** | **≈17–19¢/min** | **≈A$0.26–0.30/min** |
| Twilio AU **local** number (voice; SMS support not stated) | US$2.50/mo | 3.90/mo |
| Twilio AU **mobile** number (voice + SMS + STOP replies) | US$8.25/mo | 12.80/mo |
| SMS to an AU mobile (our text is 2 segments) | 2 × 5.15¢ | 0.16 per link |
| Inbound return calls (to us, then transferred to Sai) | 0.6¢ + Retell + onward call | ≈0.30/min |
| Retell browser tests | same per-minute rate, from the free US$10 credit | 0 cash |

Recommendation: do all prototype testing in the browser on Retell's free credit, then buy **one AU mobile number** (voice + SMS) for the phone prototype and pilot. Expected cash spend: about A$13 for the number for one month + about A$10–15 of calls and SMS, well inside A$50.



Per-minute cost of a call to an Australian mobile, in USD, from each provider's official pricing page (read 25 Nov 2026):

| | Retell AI | Vapi | ElevenLabs Agents | Twilio (DIY, ConversationRelay) |
|---|---|---|---|---|
| Platform | 5.5¢ voice infra | 5¢ hosting | 8¢ per call minute | Not checked¹ |
| Speech to text | included | ~1¢ (Deepgram, pass-through) | included | Not checked¹ |
| Voice (TTS) | 1.5¢ (platform voices) | 1.5–2.4¢ (ElevenLabs, pass-through) | included | Not checked¹ |
| LLM | 2.5¢ Claude 4.5 Haiku (0.16–1.3¢ for GPT nano/mini) | 1–4.5¢ pass-through | billed separately | your own |
| Telephony (Twilio AU mobile) | 7.5¢ (no Retell fee on imported SIP numbers) | 7.5¢ | 7.5¢ | 7.5¢ |
| **Total** | **≈17¢ (≈A$0.26)** | ≈17–20¢ | ≈16–18¢ + plan | lowest per minute, most build |
| Subscription needed | **No** (pay as you go, US$10 free credit) | No (Core plan $29/mo optional) | **Yes** beyond 15 free minutes (Starter US$6/mo, 75 min) | No |
| Australian caller ID | Import a Twilio AU number over SIP | Import a Twilio number | Import a Twilio number / SIP | Native |
| Warm transfer to Sai | Built in (cold, warm, agentic warm) | Built in | Built in | Build it yourself |
| Signed webhooks / tools | HMAC-SHA256 `X-Retell-Signature` | Secret header | Not checked | Twilio signature |

¹ Twilio's ConversationRelay price wasn't checked. On its own, Twilio means building speech recognition, voice, turn-taking and interruption handling ourselves, which costs far more in time than it saves per minute.

**Why Retell:** it's the cheapest option that needs no subscription, has warm transfer and signed custom functions built in, and puts all four requirements (natural voice, AU caller ID, our own tools, signed webhooks) in one place. The free US$10 credit covers about 60 minutes of prototype calls. Twilio is used only as the Australian carrier.

Sources: [retellai.com/pricing](https://www.retellai.com/pricing), [Retell custom telephony](https://docs.retellai.com/deploy/custom-telephony), [Retell secure webhooks](https://docs.retellai.com/features/secure-webhook), [Retell custom functions](https://docs.retellai.com/build/single-multi-prompt/custom-function), [Retell transfer](https://docs.retellai.com/build/single-multi-prompt/transfer-call), [vapi.ai/pricing](https://vapi.ai/pricing), [elevenlabs.io/pricing/agents](https://elevenlabs.io/pricing/agents), [Twilio AU voice pricing](https://www.twilio.com/en-us/voice/pricing/au), [Twilio AU regulatory](https://www.twilio.com/en-us/guidelines/au/regulatory).

Caveats to confirm before buying: Retell's Australia telephony row on its pricing page was ambiguous (we assume no Retell fee on imported SIP numbers, as its FAQ says); Twilio's AU page lists conflicting mobile/toll-free monthly prices (local numbers are consistently US$3/month); the Retell model id `claude-4.5-haiku` must be checked against Retell's model list when provisioning.

## Australian rules and how the system enforces them

Not legal advice. Items marked **verify** couldn't be read from the official source during research (the page timed out or refused access) and should be checked by Sai or a solicitor before the pilot.

| Rule | Source | Enforced by |
|---|---|---|
| Calling hours: weekdays 9am–8pm, Saturday 9am–5pm, never Sunday or a national public holiday, in the recipient's local time | Telemarketing and Research Calls Industry Standard 2017, s8 | `phone_legal_window_ok()` on every call start and every callback time; national holidays table (weekday in-lieu days blocked too). Our own window is narrower: Mon–Fri 10:00–16:30 |
| At the start of the call: who's calling (business), on whose behalf, and the purpose. A given name isn't required for a synthetic voice. Recorded/synthetic-voice calls must give a way to ask for the s9(4) details during the call | Standard s9(2), s12; the DNCR Act's "voice call" includes recorded or synthetic voices | Short fixed opening (`BEGIN_MESSAGE`); the agent gives the legal entity, ABN, our number and website on request and can transfer to Sai or book a call. Policy check on every simulated call |
| On request: contact details, and who handles complaints | Standard s9(4), s11, s12 | Prompt rule 12: our number (the caller ID) and evntly.au; Sai handles questions |
| End the call immediately when asked | Standard s13(1)(b) | `opt_out` tool, then `end_call`; policy check fails a call that keeps talking |
| Caller ID shown, and the number must take return calls for 30 days | Standard s14 | We call from our own AU number. **To do at setup:** forward inbound calls on that number to Sai's phone |
| Do Not Call Register: wash numbers in the last 30 days, or have consent. Business numbers can't be registered, but a sole trader's mainly private mobile can | DNCR Act 2006; donotcall.gov.au | A pilot call needs a DNCR check under 30 days old **and** express consent. Registered numbers go straight onto the permanent suppression list. Quick check is free for under 10 numbers (subscription type A: free up to 500 numbers a year) |
| A published number isn't consent. Express consent with no stated period lasts 3 months | DNCR guidance on consent | `admin_phone_record_consent` only accepts express consent (written, web form, DM reply) with quoted evidence; it expires after 3 months |
| SMS/email: consent first (express is best practice; you must be able to prove it: who, when, how); identify the sender by legal name or name + ABN with contact details valid for 30 days; an unsubscribe that's clear, free, works for 30 days and is honoured within 5 working days; you can't send an electronic message to *ask* for consent | ACMA [Avoid sending spam](https://www.acma.gov.au/avoid-sending-spam) and [consent expectations](https://www.acma.gov.au/articles/2024-06/consent-expectations-businesses-using-direct-marketing) (read 25 Nov 2026) | The link is sent only after a recorded yes on the call (quote, time, call ref). The SMS names "Evntly (ABN 49 193 658 959)", comes from our own number (an alphanumeric sender can't receive STOP) and says "Reply STOP"; STOP suppresses the number immediately. The email names the legal entity and says reply "unsubscribe". The web callback form's consent box is unticked and its exact wording is stored |
| A party to a private conversation must not record it with a listening device unless all principal parties consent (expressly or impliedly), or one party consents and it's reasonably necessary to protect their lawful interests / not for publishing | Surveillance Devices Act 2007 (NSW) s7(1)(b), s7(3) (read 25 Nov 2026) | **No recording.** At Retell: `data_storage_setting: basic_attributes_only` (no audio or transcript kept, metadata only) and `data_storage_retention_days: 30`. In our database: transcripts are dropped unless recording is switched on (needs a recorded legal-review note) **and** the person agreed on the call |
| Don't impersonate a human; no false or misleading claims | Australian Consumer Law s18 / s29 | Prompt rules; automated checks for human claims, guarantees and demand numbers |

Opt-outs are permanent: `phone_suppression` rows can't be updated or deleted (trigger), and opting out also marks the prospect do-not-contact in the outreach tracker. Prototype calls to Sai's own phone are the only exception: an opt-out there is recorded, but his own number isn't blocked.

### Needs professional legal advice before calling vendors outside the prototype

1. **Is a call to a business owner's number a "telemarketing call" under the Standard?** It defines the call recipient as "an individual" and keys calling hours to a "residential address". We follow it in full anyway (hours, identification, termination, caller ID), but the scope affects other duties.
2. **Asking for consent by Instagram/Facebook DM.** ACMA says you can't send an electronic message to ask for consent, because that is itself a marketing message. Our existing outreach DMs rely on conspicuously published business contacts (inferred consent). Check whether a DM that offers a call is covered, or whether consent should only come from vendors who message us first or use the website form.
3. **Is live speech processing by the AI a "listening device" use under the NSW Act** (audio is transcribed in real time but not stored)? We keep no recordings or transcripts at Retell, but get a view on whether announcing the AI and having the vendor's express consent to the call is enough.
4. **Cross-border processing.** Retell and its speech/LLM providers process call audio outside Australia (Retell doesn't state its data location; it says it runs on AWS outside the EU). Australian Privacy Principle 8 and our privacy policy need to cover this; see below.
5. **Consent evidence and duration.** Express consent to a call expires after 3 months in our system (the DNCR guidance default). Confirm that's appropriate, and that a web form tick plus stored wording is sufficient proof.

### Privacy and third parties

- **Retell AI** (voice platform): SOC 2 Type 1 and 2, GDPR and HIPAA programmes; a self-signable DPA at click-agreements.retellai.com, with zero data retention agreements with its LLM, speech and voice subprocessors. **Sign the DPA before the pilot.** Data location isn't stated (assume the US).
- **Twilio** (Australian number, SMS): carrier for the call and SMS; keeps standard call detail records.
- **Our database** keeps outcome, summary, consent evidence and suppression, never audio. Transcripts only with recording switched on, which it isn't.
- **Privacy policy:** before calling vendors, add that Evntly may contact vendors who request it by phone using an AI assistant, that call audio is processed by overseas providers (Retell AI and its subprocessors) to run the conversation and isn't recorded, and how to opt out. Draft wording is in SETUP.md, step 9.

## How it fits together

```
Admin → Phone agent (Sai, MFA)                Retell AI (voice, LLM, AU number over Twilio SIP)
  │ admin_phone_start_call()  ← every rule       │  speaks the prompt in src/lib/phone-agent/prompt.ts
  │   re-checked in the database                 │
  └─► POST create-phone-call (server only) ─────►│
                                                  │ custom functions (signed X-Retell-Signature)
/api/phone-agent/tool  ◄──────────────────────────┤  opt_out · send_registration_link · request_assisted_listing
  verify signature → phone_agent_tool(ref, id)    │  schedule_callback · check_transfer · record_outcome
/api/phone-agent/webhook ◄────────────────────────┘  call_started / call_ended / transfer events
  verify signature → phone_agent_call_event()
/api/phone-agent/sms  ◄── Twilio (signed): STOP → permanent suppression
```

- **No database credentials reach the voice agent.** Retell holds only our tool URLs. Our server verifies the HMAC signature (5-minute replay window), then calls one of three service-role-only functions through a client wrapper that refuses anything else. `phone_agent_tool()` binds Retell's call id to our call reference on first use and rejects every other call id, so a request can only act on its own call.
- **Outreach tracker:** when a pilot call ends, the prospect is marked contacted (and replied/interested when they talked), and `vendor_prospect_events` gets `contacted`/`replied` rows, so Admin → Growth counts the calls.
- **Spend:** each call's provider cost (USD → AUD at the rate in settings) is written to `acquisition_spend` as `ai_phone`, so cost per registration and per completed listing include it.
- **Registrations and listings from calls:** `admin_phone_agent_summary()` counts vendor accounts created after the call with the prospect's or the emailed address, plus sign-ups and drafts carrying the call's `aicall-<ref>` tag, and their completed listings (approved + 3 photos + 1 package). Test accounts are excluded.
- **Assisted listings:** a yes on the call creates a follow-up (with the permission quote) for Sai to prepare an assisted draft in Admin → Vendor drafts.

| Piece | File |
|---|---|
| Schema, rules, RPCs (not applied) | `supabase/migrations/20261202090000_phone_agent.sql` (+ rollback) |
| Prompt, facts, category angles | `src/lib/phone-agent/prompt.ts` |
| Tools and validation | `src/lib/phone-agent/tools.ts` |
| Routes | `src/app/api/phone-agent/{tool,webhook,sms}/route.ts` |
| Admin page | `src/app/admin/phone-agent/page.tsx`, `src/lib/actions/admin-phone-agent.ts` |
| Retell agent definition | `scripts/phone-agent/provision-retell.ts` → `docs/phone-agent/retell-agent.json` |
| Simulator and scenarios | `src/lib/phone-agent/simulator.ts`, `tests/fixtures/phone-agent-scenarios.ts` |

## Testing done

### Live AI simulations on Retell (25 Nov 2026)

Retell's simulation testing played each vendor persona (its own AI) against our real agent, with tools live against the local test database. Latest run's transcripts: [retell-simulation-report.md](retell-simulation-report.md) (the three-scenario check of the call-id fix; the final 12-scenario transcripts were overwritten by it); script: `scripts/phone-agent/retell-simulations.ts`.

| Round | Agent model | Retell grading | Our rule checks | What changed after |
|---|---|---|---|---|
| 1 | claude-4.5-haiku | 9/12 | 5/12 | Tool requests were over our size limit (fixed); turns too long; outcome missing after callbacks; a small re-pitch after a no; personas tightened |
| 2 | claude-4.5-haiku | 11/12 | 9/12 | Never claim to know their account; answer "are you a robot?" first |
| A/B | claude-5.5-haiku vs gpt-4.1-mini (pricing and demand) | 2/2 each | — | GPT most concise and cheapest but skipped the email read-back; Claude 5.5 most careful |
| Final | **claude-5.5-haiku** | **12/12** | **11/12** (one 46-word turn vs our 45 limit) | — |

Bugs these runs found and fixed: request size limit (413), a failed SMS still being recorded as "link sent" (so the email retry wouldn't actually send), and playground/simulation calls all sharing one call id (now kept apart). The agent now only offers channels that work (email until the Twilio number exists).

### Offline

- **13 simulated conversations** (`tests/unit/phone-agent-scenarios.test.ts`, report: [simulation-report.md](simulation-report.md)): interested, busy, pricing, customer demand, already registered, uninterested, asks for a human, do-not-contact, assisted onboarding, registration help (with a mis-heard email), "are you a robot?", human requested outside Sai's hours (Sunday callback refused, Saturday booked), and a guardrail case (link without a yes is refused). Each runs through the real tool path and migration, and every agent line is checked against the rules. All pass.
  These conversations are scripted reference calls, not a live model's words. `scripts/phone-agent/simulate-live.ts` runs the same personas with a real model playing both sides (needs `ANTHROPIC_API_KEY`; about US$0.30 for the full set). It hasn't been run yet.
- **Rule checks catch violations** (`tests/unit/phone-agent.test.ts`): human claims, guarantees, demand numbers, links without consent, pitching after an opt-out, unrecorded outcomes; plus signature, STOP-word, phone-number and link tests.
- **Database rules** (`tests/sql/phone-agent.test.ts`, PGlite): off by default, prototype allow-list, hours/holidays, consent and DNCR expiry, already-registered vendors, permanent suppression, callbacks, transfers, admin-only access, rollback.
- **Real Postgres + PostgREST** (local Docker Supabase, no production): migration applied cleanly. Signed requests to the running app: unsigned or wrong-key requests got 401, a hijacked call id was refused, the link without consent was refused, a Sunday callback was refused, a Thursday callback was booked, and the end-of-call webhook stored cost and outcome, logged A$0.40 spend and dropped the transcript.
- **Not done:** the admin page wasn't viewed in a browser (it needs an MFA admin session); it passes typecheck and lint.

## Going live (each step needs Sai's approval)

1. **Apply the migration** `20261202090000_phone_agent` (needs 20261130090000 and 20261130100000 applied first).
2. **Retell account** (free, US$10 credit, no subscription). Create an API key **with webhook signing**.
3. **Twilio AU local number** (≈US$3/month, needs ASIC extract or ABN and an Australian address; approval takes up to 3 business days). Create an Elastic SIP trunk with origination `sip:sip.retellai.com`, import the number into Retell, and forward inbound calls to Sai's phone.
4. **Provision the agent:** `RETELL_API_KEY=… RETELL_VOICE_ID=<en-AU voice> OWNER_TRANSFER_NUMBER=+614… PHONE_AGENT_PUBLIC_URL=https://evntly.au npx vite-node --config vitest.config.mts scripts/phone-agent/provision-retell.ts --apply`
5. **Set server env vars:** `PHONE_AGENT_ENABLED=true`, `RETELL_API_KEY`, `RETELL_AGENT_ID`, `PHONE_AGENT_FROM_NUMBER`; for SMS, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`, with the Twilio messaging webhook pointed at `/api/phone-agent/sms`.
6. **Prototype:** Admin → Phone agent, mode Prototype, add your number, **Call me now**. Try each scenario yourself and rate each call 1–5.
7. **Pilot** (below).

## Pilot plan: 10 vendors, A$50

**Who:** 10 Sydney vendors from the outreach tracker who **said yes to a call** (e.g. replied "happy to chat" to an Instagram DM). For each, record that consent with the quote, run a DNCR Quick check, and record the result. Mix categories (2 photographers, 2 DJs/MCs, 2 decorators/florists, 2 makeup/beauty, 2 others).

**How:** mode Pilot, pilot limit 10, 10 calls a day, at most 2 attempts each, Mon–Fri 10:00–16:30. Callbacks and assisted listings appear as follow-ups. Rate every connected call.

**Budget (A$):**

| Item | Estimate |
|---|---|
| Twilio AU number, 1 month | 4.65 |
| Prototype: ~15 test calls × ~1.5 min | 6 |
| Pilot: 10 vendors × up to 2 attempts × ~1.5 min | 8 |
| SMS links (~10) | 1–2 |
| Contingency (longer calls, retries, live simulation) | 30 |
| **Total cap** | **50**, enforced in settings: no call starts once spend reaches it |

**Measures** (Admin → Phone agent, also in Growth): answer rate; conversation quality (your 1–5 ratings, plus opt-outs and complaints); interest rate (high/medium); links sent, assisted requests, callbacks and transfers; registrations and completed listings from calls; cost per registration and per completed listing; **your time saved** (calls you didn't have to make vs callbacks/transfers you took).

**Stop or pause if:** any complaint, any call breaking a rule, opt-outs above 2 of 10, or average quality below 3.

**Success:** at least 3 of 10 interested, at least 2 registrations and 1 completed listing within 14 days, cost per registration under A$25, no compliance issues. If met, the next step is up to 30 consenting vendors at the same caps.
