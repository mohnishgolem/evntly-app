import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { foundingShareLink, isFoundingPath, sourceFromParams } from "@/lib/founding/sources";
import { parseCsv, parseWaitlistCsv, toCsv } from "@/lib/founding/csv";
import { claimUrl, inviteHeaders, renderInviteEmail, INVITE_SUBJECT } from "@/lib/founding/invite-email";
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
    [{ src: "<script>" }, null],
    [{}, null],
  ])("%j → %s", (params, expected) => {
    expect(sourceFromParams(params)).toBe(expected);
  });

  it("share links round-trip to their source", () => {
    for (const s of ["instagram_bio", "instagram_story", "instagram_dm", "waitlist_email", "direct_outreach"] as const) {
      const url = new URL(foundingShareLink(s));
      expect(url.pathname).toBe("/founding-vendors");
      expect(url.searchParams.get("utm_campaign")).toBe("founding_vendors");
      expect(sourceFromParams(Object.fromEntries(url.searchParams))).toBe(s);
    }
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
  const email = renderInviteEmail({
    firstName: "Jane Smith",
    token: "tok_123",
    unsubscribeToken: "a".repeat(64),
    expiresAt: new Date("2026-11-15T01:00:00Z"),
  });

  it("uses the approved subject and copy", () => {
    expect(email.subject).toBe(INVITE_SUBJECT);
    expect(INVITE_SUBJECT).toBe("You're Invited — Claim Your Free Evntly Vendor Account");
    expect(email.text).toContain("Hi Jane,");
    expect(email.text).toContain("Thanks for joining the Evntly waitlist!");
    expect(email.text).toContain("We're inviting our first 20 Sydney event vendors to join our private beta.");
    expect(email.text).toContain("Mohnish\nFounder, Evntly");
  });

  it("carries the personal link, sender identity and unsubscribe", () => {
    for (const body of [email.html, email.text]) {
      expect(body).toContain("/founding-vendors/claim?invite=tok_123");
      expect(body).toContain("ABN 49 193 658 959");
      expect(body).toContain(`/founding-vendors/unsubscribe?t=${"a".repeat(64)}`);
    }
    expect(email.text).toContain("15 November");
  });

  it("escapes names and falls back to 'there'", () => {
    const html = renderInviteEmail({ firstName: "<b>x</b>", token: null, unsubscribeToken: null, expiresAt: null }).html;
    expect(html).not.toContain("<b>x</b>");
    expect(renderInviteEmail({ firstName: null, token: null, unsubscribeToken: null, expiresAt: null }).text).toMatch(/^Hi there,/);
  });

  it("preview emails link nowhere real", () => {
    expect(claimUrl(null)).toContain("invite=preview");
  });

  it("has one-click unsubscribe headers", () => {
    const h = inviteHeaders("b".repeat(64));
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(h["List-Unsubscribe"]).toContain(`/api/founding/unsubscribe?t=${"b".repeat(64)}`);
    expect(h["List-Unsubscribe"]).toContain("mailto:hello@evntlyapp.com");
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
