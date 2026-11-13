import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { campaignFromParams, campaignLink, FOUNDING_GOAL, foundingShareLink, isFoundingPath, isReferralCode, referralFromParams, referralLink, sourceFromParams } from "@/lib/founding/sources";
import { formatSydney, formatSydneyDay, planBatches, planProblem, sydneyToUtc } from "@/lib/founding/schedule";
import { parseConsentDate, parseCsv, parseWaitlistCsv, toCsv } from "@/lib/founding/csv";
import { claimUrl, inviteHeaders, renderInviteEmail, renderReminderEmail, INVITE_SUBJECT, REMINDER_SUBJECT } from "@/lib/founding/invite-email";
import { buildReport, classifyRow, shouldImport, type ContactFacts } from "@/lib/founding/import-check";
import { hashInviteToken, looksLikeInviteToken, newInviteToken } from "@/lib/founding/tokens";
import { deliveryUpdateFor, verifyResendWebhook } from "@/lib/founding/resend-webhook";

describe("founding sources (UTM)", () => {
  it.each([
    [{ utm_source: "instagram", utm_medium: "bio" }, "instagram_bio"],
    [{ utm_source: "Instagram", utm_medium: "story" }, "instagram_story"],
    [{ utm_source: "instagram", utm_medium: "stories" }, "instagram_story"],
    [{ utm_source: "ig", utm_medium: "dm" }, "instagram_dm"],
    [{ utm_source: "instagram" }, "instagram_bio"],
    [{ utm_source: "waitlist", utm_medium: "email" }, "waitlist_email"],
    [{ utm_source: "outreach", utm_medium: "direct" }, "direct_outreach"],
    [{ utm_source: "facebook" }, "direct"],
    [{ src: "instagram_dm" }, "instagram_dm"],
    [{ src: "meta_ads" }, "meta_ads"],
    [{ utm_source: "meta", utm_medium: "paid" }, "meta_ads"],
    [{ utm_source: "facebook", utm_medium: "cpc" }, "meta_ads"],
    [{ utm_source: "instagram", utm_medium: "paid_social" }, "meta_ads"],
    [{ src: "<script>" }, null],
    [{}, null],
  ])("%j → %s", (params, expected) => {
    expect(sourceFromParams(params)).toBe(expected);
  });

  it.each([
    [{ utm_content: "reel-a-1117" }, "reel-a-1117"],
    [{ utm_content: " Link_In_Bio " }, "link_in_bio"],
    [{ c: "dm-batch3" }, "dm-batch3"],
    [{ utm_content: ["story-1118", "x"] }, "story-1118"],
    [{ utm_content: "has space" }, null],
    [{ utm_content: "-leading-dash" }, null],
    [{ utm_content: "a".repeat(41) }, null],
    [{ utm_content: "<script>" }, null],
    [{}, null],
  ])("campaign tag %j → %s", (params, expected) => {
    expect(campaignFromParams(params)).toBe(expected);
  });

  it("campaign links carry the source and the tag", () => {
    const url = new URL(campaignLink("instagram_story", "story-1118"));
    expect(url.pathname).toBe("/founding-vendors");
    const params = Object.fromEntries(url.searchParams);
    expect(sourceFromParams(params)).toBe("instagram_story");
    expect(campaignFromParams(params)).toBe("story-1118");
    expect(() => campaignLink("instagram_bio", "Bad Tag")).toThrow();
  });

  it("the live Instagram bio link is an instagram_bio source tagged link_in_bio", () => {
    const params = { utm_source: "ig", utm_medium: "social", utm_content: "link_in_bio" };
    expect(sourceFromParams(params)).toBe("instagram_bio");
    expect(campaignFromParams(params)).toBe("link_in_bio");
  });

  it("share links round-trip to their source", () => {
    for (const s of ["instagram_bio", "instagram_story", "instagram_dm", "waitlist_email", "direct_outreach", "meta_ads"] as const) {
      const url = new URL(foundingShareLink(s));
      expect(url.pathname).toBe("/founding-vendors");
      expect(url.searchParams.get("utm_campaign")).toBe("founding_vendors");
      expect(sourceFromParams(Object.fromEntries(url.searchParams))).toBe(s);
    }
  });

  it("referral links carry a valid code and count as the referral source", () => {
    const url = new URL(referralLink("ab12cd34ef"));
    expect(url.pathname).toBe("/founding-vendors");
    const params = Object.fromEntries(url.searchParams);
    expect(referralFromParams(params)).toBe("ab12cd34ef");
    expect(sourceFromParams(params)).toBe("referral");
    // An explicit src still wins.
    expect(sourceFromParams({ ...params, src: "instagram_dm" })).toBe("instagram_dm");
  });

  it.each(["AB12CD34EF", " ab12cd34ef "])("normalises %j", (ref) => {
    expect(referralFromParams({ ref })).toBe("ab12cd34ef");
  });

  it.each(["short", "toolongcode1234", "ab12-cd34ef", "<script>", ""])("ignores malformed code %j", (ref) => {
    expect(referralFromParams({ ref })).toBeNull();
    expect(sourceFromParams({ ref })).toBeNull();
    expect(isReferralCode(ref)).toBe(false);
  });

  it("only treats /founding-vendors paths as founding", () => {
    expect(isFoundingPath("/founding-vendors/claim?invite=x")).toBe(true);
    expect(isFoundingPath("/founding-vendors")).toBe(true);
    expect(isFoundingPath("/founding-vendorsevil")).toBe(false);
    expect(isFoundingPath("/vendor-signup")).toBe(false);
    expect(isFoundingPath(null)).toBe(false);
  });
});

describe("waitlist CSV", () => {
  it("parses quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("imports rows and only marks explicit consent", () => {
    const { rows, errors } = parseWaitlistCsv(
      "Email,First Name,Business,Category,Consent,Consent note\n" +
        "jane@photo.com.au,Jane Smith,Jane Photo,photographer,yes,Form Sept\n" +
        "JANE@photo.com.au,Dup,,,yes,\n" +
        "tom@dj.com.au,Tom,,dj,,\n" +
        "not-an-email,Bad,,,yes,\n",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ email: "jane@photo.com.au", first_name: "Jane", business_name: "Jane Photo", invite_consent: true, consent_note: "Form Sept" });
    expect(rows[1]).toMatchObject({ email: "tom@dj.com.au", invite_consent: false });
    expect(errors.join(" ")).toMatch(/appears twice/);
    expect(errors.join(" ")).toMatch(/isn't a valid email/);
  });

  it("warns when there's no consent column and invites nobody", () => {
    const { rows, errors } = parseWaitlistCsv("email\na@b.com.au\n");
    expect(rows[0].invite_consent).toBe(false);
    expect(errors[0]).toMatch(/consent/i);
  });

  it("refuses a file without an email column", () => {
    expect(parseWaitlistCsv("name\nJane\n").errors[0]).toMatch(/email/);
  });

  it("neutralises spreadsheet formulas on export", () => {
    const csv = toCsv(["name"], [["=HYPERLINK(\"x\")"], ['a "q"'], [null]]);
    expect(csv).toBe('"name"\r\n"\'=HYPERLINK(""x"")"\r\n"a ""q"""\r\n""\r\n');
  });
});

describe("invitation email", () => {
  const input = {
    firstName: "Jane Smith",
    token: "tok_123",
    unsubscribeToken: "a".repeat(64),
    expiresAt: new Date("2026-11-15T01:00:00Z"),
  };
  const email = renderInviteEmail(input);
  const reminder = renderReminderEmail(input);
  const links = (html: string) => [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

  it("uses the approved subject, copy, button and signature", () => {
    expect(email.subject).toBe("You're Invited to Join Evntly – Early Vendor Access");
    expect(INVITE_SUBJECT).toBe(email.subject);
    for (const line of [
      "Hi Jane,",
      "Thanks for joining the Evntly waitlist!",
      "I'm excited to invite you to become one of our first Sydney vendors.",
      "Your early access is now ready. You can create your free vendor account, set up your business profile and showcase your services to customers looking for event professionals.",
      "We're starting with a group of founding vendors, and I'd love to have you involved.",
      "If you have any questions, just reply to this email.",
      "Mohnish\nFounder, Evntly\nhttps://evntlyapp.com",
    ]) {
      expect(email.text).toContain(line);
    }
    expect(email.html).toContain(">Create Your Free Vendor Account</a>");
  });

  it("never names a number of places or promises permanent free access or zero commission", () => {
    for (const body of [email.text, reminder.text]) {
      expect(body).not.toMatch(/\b20\b|first 20|forever|lifetime|always free|no commission|zero commission|guarantee/i);
    }
  });

  it("has one call to action plus the website and unsubscribe links, with no tracking parameters", () => {
    const all = links(email.html);
    expect(all).toEqual([
      "https://evntlyapp.com/founding-vendors/claim?invite=tok_123",
      "https://evntlyapp.com",
      `https://evntlyapp.com/founding-vendors/unsubscribe?t=${"a".repeat(64)}`,
    ]);
    expect(email.html + email.text).not.toMatch(/utm_|mailto:/);
  });

  it("keeps the Evntly card, wordmark and one orange button, without images or a hidden preheader", () => {
    expect(email.html).toContain(">Evntly</div>");
    expect(email.html).toContain("max-width:520px;background:#ffffff;border-radius:14px");
    expect(email.html.match(/background:#e8604a/g)).toHaveLength(1);
    expect(email.html).not.toMatch(/<img|display:none|max-height:0|paste this link/i);
  });

  it("keeps the personal link, expiry, review note, sender identity, reason and unsubscribe (Spam Act)", () => {
    for (const body of [email.html, email.text]) {
      expect(body).toContain("/founding-vendors/claim?invite=tok_123");
      expect(body).toContain("works until 15 November");
      expect(body).toContain("Every listing is reviewed by our team");
      expect(body).toContain("ABN 49 193 658 959");
      expect(body).toContain("joined the Evntly vendor waitlist");
      expect(body).toContain(`/founding-vendors/unsubscribe?t=${"a".repeat(64)}`);
    }
  });

  it("the reminder is short, personal and says the new link replaces the old one", () => {
    expect(reminder.subject).toBe(REMINDER_SUBJECT);
    expect(REMINDER_SUBJECT).toBe("Following up on your Evntly invitation");
    expect(reminder.text).toMatch(/^Hi Jane,/);
    expect(reminder.text).toContain("Just following up on my invitation from a few days ago.");
    expect(reminder.text).toContain("It replaces the link in my earlier email.");
    expect(reminder.text).toContain("you'd rather not join right now, just reply");
    expect(reminder.html).toContain(">Create Your Free Vendor Account</a>");
    expect(reminder.text).toContain(`/founding-vendors/unsubscribe?t=${"a".repeat(64)}`);
    expect(reminder.text.length).toBeLessThan(email.text.length);
  });

  it("escapes names and falls back to 'there'", () => {
    const html = renderInviteEmail({ firstName: "<b>x</b>", token: null, unsubscribeToken: null, expiresAt: null }).html;
    expect(html).not.toContain("<b>x</b>");
    expect(renderInviteEmail({ firstName: null, token: null, unsubscribeToken: null, expiresAt: null }).text).toMatch(/^Hi there,/);
  });

  it("preview emails link nowhere real", () => {
    expect(claimUrl(null)).toBe("https://evntlyapp.com/founding-vendors/claim?invite=preview");
  });

  it("has one-click unsubscribe headers", () => {
    const h = inviteHeaders("b".repeat(64));
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(h["List-Unsubscribe"]).toContain(`/api/founding/unsubscribe?t=${"b".repeat(64)}`);
    expect(h["List-Unsubscribe"]).toContain("mailto:hello@evntlyapp.com");
  });
});

describe("import check", () => {
  const facts = (over: Partial<ContactFacts> = {}): ContactFacts => ({
    onWaitlist: false, unsubscribed: false, inviteStatus: null, deliveryStatus: null, hasAccount: false, registeredVendor: false, applied: false, ...over,
  });
  const row = (email: string, consent = true) => ({ email, first_name: null, business_name: null, category: null, suburb: null, invite_consent: consent, consent_note: null, consent_at: null });

  it.each([
    ["eligible", row("a@b.com.au"), facts()],
    ["eligible", row("a@b.com.au"), facts({ hasAccount: true })],
    ["eligible", row("a@b.com.au"), facts({ onWaitlist: true, inviteStatus: "failed" })],
    ["no_consent", row("a@b.com.au", false), facts()],
    ["registered_vendor", row("a@b.com.au"), facts({ hasAccount: true, registeredVendor: true })],
    ["already_applied", row("a@b.com.au"), facts({ applied: true })],
    ["suppressed", row("a@example.com"), facts()],
    ["suppressed", row("x@test.example"), facts()],
    ["suppressed", row("a@b.com.au"), facts({ deliveryStatus: "bounced" })],
    ["suppressed", row("a@b.com.au"), facts({ deliveryStatus: "complained" })],
    ["unsubscribed", row("a@b.com.au"), facts({ unsubscribed: true })],
    ["already_invited", row("a@b.com.au"), facts({ inviteStatus: "sent" })],
    ["already_invited", row("a@b.com.au"), facts({ inviteStatus: "claimed" })],
  ] as const)("%s", (verdict, r, f) => {
    expect(classifyRow(r, f)).toBe(verdict);
  });

  it("builds counts and masked notes, never full addresses", () => {
    const rows = [row("jane@photo.com.au"), row("tom@dj.com.au", false), row("sam@decor.com.au")];
    const byEmail = new Map([["sam@decor.com.au", facts({ registeredVendor: true, hasAccount: true })]]);
    const report = buildReport(rows, byEmail, ["Row 5: duplicate"]);
    expect(report.rowsInFile).toBe(3);
    expect(report.counts.eligible).toBe(1);
    expect(report.counts.no_consent).toBe(1);
    expect(report.counts.registered_vendor).toBe(1);
    expect(report.withAccount).toBe(1);
    expect(report.notes).toEqual(["Row 5: duplicate", "t•••@dj.com.au: No invitation consent in the file", "s•••@decor.com.au: Already a registered vendor"]);
    expect(report.notes.join(" ")).not.toMatch(/tom@|sam@|jane@/);
  });

  it("imports everything except registered vendors and undeliverable addresses", () => {
    expect(shouldImport(row("a@b.com.au", false), facts())).toBe(true);
    expect(shouldImport(row("a@b.com.au"), facts({ unsubscribed: true }))).toBe(true);
    expect(shouldImport(row("a@b.com.au"), facts({ registeredVendor: true }))).toBe(false);
    expect(shouldImport(row("a@x.test"), facts())).toBe(false);
  });

  it("accepts the required CSV columns", () => {
    const { rows, errors } = parseWaitlistCsv(
      "email,first_name,business_name,category,invite_consent,consent_note\njane@photo.com.au,Jane,Jane Photo,photographer,yes,Tally waitlist form Sept 2026\n",
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({
      email: "jane@photo.com.au", first_name: "Jane", business_name: "Jane Photo", category: "photographer",
      suburb: null, invite_consent: true, consent_note: "Tally waitlist form Sept 2026", consent_at: null,
    });
  });
});

describe("consent dates", () => {
  it("reads sheet dates as Sydney time", () => {
    expect(parseConsentDate("6/22/2026 12:56:56")).toBe("2026-06-22T02:56:00.000Z"); // AEST +10
    expect(parseConsentDate("2026-06-22 12:56")).toBe("2026-06-22T02:56:00.000Z");
    expect(parseConsentDate("2026-10-20")).toBe("2026-10-19T13:00:00.000Z"); // AEDT +11
  });
  it("ignores blanks, nonsense and future dates", () => {
    expect(parseConsentDate("")).toBeNull();
    expect(parseConsentDate("yesterday")).toBeNull();
    expect(parseConsentDate("2/30/2026")).toBeNull();
    expect(parseConsentDate("2099-01-01")).toBeNull();
  });
  it("is imported from a consent_at column", () => {
    const { rows } = parseWaitlistCsv("email,invite_consent,consent_at\njane@photo.com.au,yes,2026-06-22 12:56\n");
    expect(rows[0].consent_at).toBe("2026-06-22T02:56:00.000Z");
  });
});

describe("founding goal", () => {
  it("is 200", () => {
    expect(FOUNDING_GOAL).toBe(200);
  });
});

describe("invite tokens", () => {
  it("are 256-bit, unique, and stored only as a hash", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(looksLikeInviteToken(a.token)).toBe(true);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashInviteToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });

  it("rejects junk before hashing", () => {
    expect(looksLikeInviteToken("preview")).toBe(false);
    expect(looksLikeInviteToken("x".repeat(44))).toBe(false);
    expect(looksLikeInviteToken(null)).toBe(false);
  });
});

describe("Resend webhook signature", () => {
  const secretBytes = Buffer.from("super-secret-key-for-tests");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_1" } });
  const now = 1_800_000_000;
  const sign = (id: string, ts: number, payload: string) =>
    `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${payload}`).digest("base64")}`;

  it("accepts a valid signature", () => {
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: String(now), signature: sign("msg_1", now, body) }, body, now)).toBe(true);
  });
  it("accepts when one of several signatures matches", () => {
    const sig = `v1,AAAA ${sign("msg_1", now, body)}`;
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: String(now), signature: sig }, body, now)).toBe(true);
  });
  it("rejects a tampered body, wrong secret, old timestamp or missing headers", () => {
    const sig = sign("msg_1", now, body);
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: String(now), signature: sig }, body + " ", now)).toBe(false);
    expect(verifyResendWebhook("whsec_" + Buffer.from("other").toString("base64"), { id: "msg_1", timestamp: String(now), signature: sig }, body, now)).toBe(false);
    expect(verifyResendWebhook(secret, { id: "msg_1", timestamp: String(now), signature: sig }, body, now + 600)).toBe(false);
    expect(verifyResendWebhook(secret, { id: null, timestamp: String(now), signature: sig }, body, now)).toBe(false);
  });
  it("maps event types", () => {
    expect(deliveryUpdateFor("email.bounced")).toEqual({ delivery_status: "bounced" });
    expect(deliveryUpdateFor("email.opened")).toEqual({ opened: true });
    expect(deliveryUpdateFor("contact.created")).toBeNull();
  });
});

describe("scheduling", () => {
  it("converts Sydney wall-clock time to UTC across daylight saving", () => {
    expect(sydneyToUtc("2026-11-03", "10:00")?.toISOString()).toBe("2026-11-02T23:00:00.000Z"); // AEDT
    expect(sydneyToUtc("2026-11-03", "10:40")?.toISOString()).toBe("2026-11-02T23:40:00.000Z");
    expect(sydneyToUtc("2026-07-01", "10:00")?.toISOString()).toBe("2026-07-01T00:00:00.000Z"); // AEST
    expect(sydneyToUtc("2026-10-04", "02:30")).toBeNull(); // skipped hour when AEDT starts
    expect(sydneyToUtc("2026-02-30", "10:00")).toBeNull();
    expect(sydneyToUtc("3/11/2026", "10am")).toBeNull();
  });

  it("formats times for people in Sydney", () => {
    expect(formatSydney(new Date("2026-11-02T23:10:00Z"))).toBe("Tue 3 Nov, 10:10 am AEDT");
    expect(formatSydney(new Date("2026-07-01T02:00:00Z"))).toBe("Wed 1 Jul, 12:00 pm AEST");
    expect(formatSydney(new Date("2026-09-14T14:05:00Z"))).toBe("Tue 15 Sep, 12:05 am AEST");
  });

  it("labels AEDT/AEST correctly across daylight-saving changeovers", () => {
    // AEDT starts Sun 4 Oct 2026: 2:00 am AEST jumps to 3:00 am AEDT (16:00Z).
    expect(formatSydney(new Date("2026-10-03T15:59:59.900Z"))).toBe("Sun 4 Oct, 1:59 am AEST");
    expect(formatSydney(new Date("2026-10-03T16:00:00Z"))).toBe("Sun 4 Oct, 3:00 am AEDT");
    // AEDT ends Sun 5 Apr 2026: 3:00 am AEDT falls back to 2:00 am AEST (16:00Z).
    expect(formatSydney(new Date("2026-04-04T15:59:00Z"))).toBe("Sun 5 Apr, 2:59 am AEDT");
    expect(formatSydney(new Date("2026-04-04T16:00:00Z"))).toBe("Sun 5 Apr, 2:00 am AEST");
  });

  it("ignores seconds when working out the zone", () => {
    expect(formatSydney(new Date("2026-11-02T23:00:59.999Z"))).toBe("Tue 3 Nov, 10:00 am AEDT");
    expect(formatSydney(new Date("2026-07-01T01:59:59.999Z"))).toBe("Wed 1 Jul, 11:59 am AEST");
  });

  it("formats Sydney days identically everywhere (no hydration mismatch)", () => {
    expect(formatSydneyDay("2026-11-02T23:10:00Z")).toBe("3 Nov");
    expect(formatSydneyDay("2026-09-01T00:00:00Z")).toBe("1 Sep");
    expect(formatSydneyDay(null)).toBe("—");
    expect(formatSydneyDay("not a date")).toBe("—");
  });

  it("plans the 3 November batches: 10 every 10 minutes", () => {
    const ids = Array.from({ length: 23 }, (_, i) => `c${i}`);
    const plan = planBatches(ids, sydneyToUtc("2026-11-03", "10:00")!, 10, 10);
    expect(plan.map((b) => [b.at.toISOString(), b.ids.length])).toEqual([
      ["2026-11-02T23:00:00.000Z", 10],
      ["2026-11-02T23:10:00.000Z", 10],
      ["2026-11-02T23:20:00.000Z", 3],
    ]);
    expect(plan.flatMap((b) => b.ids)).toEqual(ids);
  });

  it("refuses plans too soon, too far ahead or empty", () => {
    const now = new Date("2026-11-02T10:00:00Z");
    expect(planProblem([], now)).toMatch(/No contacts/);
    expect(planProblem(planBatches(["a"], new Date("2026-11-02T10:02:00Z"), 10, 10), now)).toMatch(/5 minutes/);
    expect(planProblem(planBatches(["a"], new Date("2026-12-05T10:00:00Z"), 10, 10), now)).toMatch(/30 days/);
    expect(planProblem(planBatches(["a"], new Date("2026-11-02T23:00:00Z"), 10, 10), now)).toBeNull();
  });
});
