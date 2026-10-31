import { SITE_URL } from "@/lib/config";
import { CLAIM_PATH, FOUNDING_CAMPAIGN } from "@/lib/founding/sources";

// The founding-vendor invitation. A commercial email under the Spam Act 2003,
// so every copy carries: who sent it (Sai Mohnish Golem trading as Evntly,
// ABN, contact address), why the recipient is getting it (they joined the
// waitlist and opted in), and a working unsubscribe link (plus RFC 8058
// one-click headers, see inviteHeaders).

export const INVITE_SUBJECT = "You're Invited — Claim Your Free Evntly Vendor Account";
export const SENDER_IDENTITY = "Sai Mohnish Golem trading as Evntly · ABN 49 193 658 959 · Sydney NSW, Australia";
export const CONTACT_EMAIL = "hello@evntlyapp.com";

export type InviteEmailInput = {
  firstName: string | null;
  /** Raw link token; null renders a preview link that won't claim anything. */
  token: string | null;
  unsubscribeToken: string | null;
  expiresAt: Date | null;
};

export function claimUrl(token: string | null, base = SITE_URL) {
  const url = new URL(CLAIM_PATH, base);
  url.searchParams.set("invite", token ?? "preview");
  url.searchParams.set("utm_source", "waitlist");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", FOUNDING_CAMPAIGN);
  return url.toString();
}

export function unsubscribeUrl(unsubscribeToken: string | null, base = SITE_URL) {
  const url = new URL("/founding-vendors/unsubscribe", base);
  url.searchParams.set("t", unsubscribeToken ?? "preview");
  return url.toString();
}

/** One-click unsubscribe endpoint for the List-Unsubscribe header (POST). */
export function oneClickUnsubscribeUrl(unsubscribeToken: string, base = SITE_URL) {
  const url = new URL("/api/founding/unsubscribe", base);
  url.searchParams.set("t", unsubscribeToken);
  return url.toString();
}

export function inviteHeaders(unsubscribeToken: string) {
  return {
    "List-Unsubscribe": `<${oneClickUnsubscribeUrl(unsubscribeToken)}>, <mailto:${CONTACT_EMAIL}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const greetingName = (firstName: string | null) => {
  const name = firstName?.trim().split(/\s+/)[0];
  return name && name.length <= 40 ? name : "there";
};

function expiryLine(expiresAt: Date | null) {
  if (!expiresAt) return null;
  const date = expiresAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "Australia/Sydney" });
  return `This link is just for you and works until ${date}.`;
}

const BODY = [
  "Thanks for joining the Evntly waitlist!",
  "We're inviting our first 20 Sydney event vendors to join our private beta.",
  "As an early vendor, you can create your free account, set up your business profile and test how Evntly helps customers discover and book event services.",
  "We'd love to have you involved.",
];

export function renderInviteEmail(input: InviteEmailInput) {
  const link = claimUrl(input.token);
  const unsub = unsubscribeUrl(input.unsubscribeToken);
  const name = greetingName(input.firstName);
  const expiry = expiryLine(input.expiresAt);
  const p = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a3a3c;">${escapeHtml(text)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(INVITE_SUBJECT)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">20 free places for Sydney event vendors in the Evntly private beta.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px;">
        <tr><td>
          <div style="font-size:20px;font-weight:700;color:#e8604a;margin-bottom:24px;">Evntly</div>
          ${p(`Hi ${name},`)}
          ${BODY.map(p).join("\n          ")}
          <p style="margin:18px 0 10px;font-size:15px;line-height:1.6;color:#1d1d1f;font-weight:600;">Claim your free vendor account:</p>
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 24px;background:#e8604a;color:#ffffff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:600;">Claim my free vendor account</a>
          <p style="margin:12px 0 18px;font-size:12px;line-height:1.5;color:#8e8e93;word-break:break-all;">Or paste this link into your browser: ${escapeHtml(link)}</p>
          ${expiry ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#6e6e73;">${escapeHtml(expiry)} Every listing is reviewed by our team before it goes live.</p>` : ""}
          ${p("We're looking forward to your feedback!")}
          <p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#3a3a3c;">Thanks,<br>Mohnish<br><span style="color:#6e6e73;">Founder, Evntly</span></p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.55;color:#8e8e93;">
        You're getting this because you joined the Evntly vendor waitlist and asked to hear about early access.
        <a href="${escapeHtml(unsub)}" style="color:#8e8e93;">Unsubscribe</a> and we won't email you about it again.<br>
        ${escapeHtml(SENDER_IDENTITY)} · <a href="mailto:${CONTACT_EMAIL}" style="color:#8e8e93;">${CONTACT_EMAIL}</a>
      </p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `Hi ${name},`,
    "",
    ...BODY.flatMap((line) => [line, ""]),
    "Claim your free vendor account:",
    link,
    "",
    ...(expiry ? [`${expiry} Every listing is reviewed by our team before it goes live.`, ""] : []),
    "We're looking forward to your feedback!",
    "",
    "Thanks,",
    "Mohnish",
    "Founder, Evntly",
    "",
    "---",
    "You're getting this because you joined the Evntly vendor waitlist and asked to hear about early access.",
    `Unsubscribe: ${unsub}`,
    `${SENDER_IDENTITY} · ${CONTACT_EMAIL}`,
  ].join("\n");

  return { subject: INVITE_SUBJECT, html, text };
}
