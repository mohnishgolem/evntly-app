# Phone agent setup: the steps that need you

Everything else is built. These steps need your accounts, identity or approval. Never paste keys into chat: put them in `.env.local`, which git ignores.

Budget: A$50 total including setup. The database refuses any call that could push committed spend past the cap. Calls run one at a time, and each call in progress is held at its worst-case cost (A$2) until its real cost arrives.

## 1. Retell account (free, about 5 minutes)

1. Sign up at retellai.com. New accounts get US$10 of free credit, about 70–100 minutes of agent time. There's no subscription.
2. **Billing:** leave auto-recharge **off**. Set **Monthly budget** to **US$10**; Retell pauses calls when it's reached.
3. **Settings → Limits:** set concurrency to **1** if it lets you go that low.
4. **API keys:** create a key and switch on **webhook signing** (the webhook badge). Add it to `.env.local`:
   ```
   RETELL_API_KEY=...
   ```
5. **Compliance:** sign Retell's free DPA at click-agreements.retellai.com, under your business name.
6. Tell me it's done. I'll then list the Australian voices, create the agent and connect it to your local test database.

## 2. Tunnel to your Mac (needs your OK)

Retell can only reach a public URL, so browser tests that use tools (sending links, booking callbacks, opt-outs) need a temporary tunnel to the local app. The plan is Cloudflare's free quick tunnel: no account, and the URL changes every run. It means downloading the `cloudflared` binary (about 40 MB, from github.com/cloudflare/cloudflared releases). It only exposes the local test app on port 3106, which talks to the local Docker database, never production.

## 3. Browser voice tests (free credits, no phone number needed)

In Retell: Agents → "Evntly vendor recruitment (AI)" → **Test Audio**. Set the dynamic variables, for example `vendor_name = Harbour Lens Photography`, `category = photographer`, `category_label = photographer`, `owner_name = Sai`, `call_mode = prototype`, `recording_on = no`, plus the `category_angle` text from `docs/phone-agent/retell-agent.json`. Then play a vendor:

| Try | What to check |
|---|---|
| Photographer, interested | Short intro, asks about your work, one relevant benefit, offers link / free set-up / call |
| DJ, busy | Offers a callback, books a real time, doesn't pitch |
| Decorator, "how many customers do you have?" | Honest: early days, no numbers, offers you |
| "What's the catch?" / "Are you a robot?" | Plain answers; says it's an AI |
| Interrupt it mid-sentence | Stops and listens |
| Background noise (TV, music, kitchen) | Still understands you |
| "Can someone set it up for me?" | Assisted listing with your email |
| "Can I talk to a person?" | Checks if you're available, else books a callback (transfers can't be tested in the browser) |
| "Don't call me again" | Opts out straight away and ends the call |

Rate each one (1–5). I'll read the outcomes from the local database and tune the prompt.

## 4. Live AI simulation of all 13 scenarios (optional, about US$0.30)

A real model plays the agent (the same Claude 4.5 Haiku Retell uses) and the vendor. Add `ANTHROPIC_API_KEY=...` to `.env.local` and tell me. Alternatively, Retell's own simulation testing does the same with its credits.

## 5. Australian number (Twilio), when the voice is right

1. Sign up at twilio.com and upgrade (it needs a top-up, about US$20; no auto-recharge).
2. **Regulatory bundle** (Phone Numbers → Regulatory Compliance → Australia → Mobile): for a business, the ABN 49 193 658 959 and business address; as an individual, Australian ID and address. Approval takes up to 3 business days.
3. Buy **one AU mobile number** (US$8.25 a month; voice + SMS + STOP replies).
4. **Voice → Geo permissions:** allow Australia only.
5. **Usage triggers:** an email alert at US$15 total spend.
6. **Elastic SIP trunk:** origination URI `sip:sip.retellai.com`; note the termination URI and create credentials. In Retell: Phone Numbers → Add → Import via SIP trunking, then set the outbound agent, and the return-call agent as inbound.
7. Add to `.env.local`: `PHONE_AGENT_FROM_NUMBER=+614…`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`. Point the number's messaging webhook at `<tunnel>/api/phone-agent/sms`.

## 6. First real call to your phone

I set your number on the prototype allow-list in the local database, then run:
```
npx vite-node --config vitest.config.mts scripts/phone-agent/call-me.ts +614XXXXXXXX "Harbour Lens Photography" photographer
```
Answer as a vendor. Every action lands in the local database (calls, consents, follow-ups, spend, outreach tracker), and I check them after each call.

## 7. Before any vendor is called (pilot; needs your separate approval)

- Professional legal advice on the five points in README → "Needs professional legal advice".
- Sign the Retell DPA (step 1.5).
- Privacy policy addition (draft, step 9).
- Apply the migration to production, set the env vars in Vercel, and deploy. Each needs your release approval.

## 8. Pilot candidates

Priority order, shown in Admin → Phone agent:
1. People who asked for a call (website form, or a yes on Instagram, Facebook or email that you record with their words and the date).
2. Interested prospects who haven't registered: they need to say yes to a call first.
3. Registered vendors with unfinished listings: same, they must agree to a call first.

Suggested way to ask on a DM thread *they* started or replied to: "Happy to help you finish it. Would you like a quick call from our AI assistant (or from me) to set it up? Reply yes with a good time."

## 9. Privacy policy wording (draft, for review)

> **Phone calls from our AI assistant.** If you ask us to call you about listing your business, the call may be made by Evntly's AI assistant, an automated voice assistant that says it's an AI at the start of the call. To run the conversation, your voice is processed in real time by our voice provider, Retell AI, and its speech and language model providers, which may be located outside Australia (including the United States). We don't record these calls or keep transcripts; we keep a short note of the outcome (for example, that you asked for a link or a callback) and your consent. You can ask to speak to a person, or ask us never to call again, at any time during the call, by replying STOP to our text, or by emailing hello@evntlyapp.com.
