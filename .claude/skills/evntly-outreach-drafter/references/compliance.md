# Outreach compliance checklist (Australia)

Run through this before any draft goes to `awaiting_approval`.

**Spam Act 2003 (email, SMS, and commercial electronic messages generally)**
- [ ] Consent: inferred from a conspicuously published business address, no "no unsolicited marketing" notice on the page, and the message is about their business. Record the page in `consent_note`.
- [ ] Identify: Evntly + Sai's name, business location.
- [ ] Functional unsubscribe: "reply no thanks and I won't email again"; honour within 5 business days (we do it immediately: `do_not_contact`).
- [ ] No address harvesting software, no guessed addresses, no purchased lists.

**Platform rules**
- [ ] Instagram/Facebook: manual, one-to-one, from @evntly.au / Sai's profile. No automation tools, no unofficial APIs, no bulk identical messages, respect "No DMs" in bio, stop on any action block.
- [ ] Daily caps: IG ≤ 15 first DMs, email ≤ 20, FB none while capped.

**Honesty (Australian Consumer Law — no misleading claims)**
- [ ] Only live features and perks (check `/founding-vendors` today).
- [ ] No invented numbers (customers, bookings, vendors, reach).
- [ ] No claims about competitors beyond their public pages.

**Privacy (APP)**
- [ ] Only business contact data, kept in Supabase/`outreach/` (gitignored).
- [ ] No vendor emails/phones in artifacts, chat summaries, URLs or third-party tools.

**Approval**
- [ ] Sai approved this exact text for this exact vendor, today.
