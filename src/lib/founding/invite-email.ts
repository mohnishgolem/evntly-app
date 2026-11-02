import { SITE_URL } from "@/lib/config";
import { CLAIM_PATH } from "@/lib/founding/sources";

// The founding-vendor invitation. Written to read like a short personal note
// from the founder rather than a newsletter: plain layout, no images, no
// hidden preview text, one link, no tracking parameters, and an invitation to
// reply. (Gmail decides tabs itself; this only removes promotional signals.)
//
// It's still a commercial email under the Spam Act 2003, so every copy says
// who sent it (Sai Mohnish Golem trading as Evntly, ABN, contact address),
// why the recipient is getting it (they joined the waitlist and opted in),
// and has a working unsubscribe link plus RFC 8058 one-click headers.
//
// The link carries only the invite token: the claim page records the source
// as the waitlist email from the token itself, so no utm_ parameters.

export const INVITE_SUBJECT = "Your invitation to the Evntly vendor beta";
export const SENDER_IDENTITY = "Sai Mohnish Golem trading as Evntly, ABN 49 193 658 959, Sydney NSW, Australia";
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

function expiryDate(expiresAt: Date | null) {
  return expiresAt?.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "Australia/Sydney" }) ?? null;
}

const LINK_TEXT = "Set up your vendor account";

// Paragraphs before and after the link. Plain sentences, no exclamation-heavy
// sales copy; "free" appears once, where it's a fact the vendor needs.
function paragraphs(expiry: string | null) {
  return {
    before: [
      "Thanks for joining the Evntly waitlist.",
      "We're inviting our first 20 Sydney event vendors into a private beta, and I'd like you to be one of them. You can create a free account, set up your business profile and see how customers find and book event services on Evntly.",
      `Here's your personal link${expiry ? ` (it works until ${expiry})` : ""}:`,
    ],
    after: [
      "Every listing is reviewed by our team before it goes live. If you have any questions, or something doesn't work, just reply to this email.",
      "I'd really value your feedback.",
    ],
  };
}

export function renderInviteEmail(input: InviteEmailInput) {
  const link = claimUrl(input.token);
  const unsub = unsubscribeUrl(input.unsubscribeToken);
  const name = greetingName(input.firstName);
  const { before, after } = paragraphs(expiryDate(input.expiresAt));
  const p = (text: string) => `<p style="margin:0 0 16px;">${escapeHtml(text)}</p>`;

  // Deliberately close to a plain-text email: no wrapper card, background
  // colour, logo, button or hidden preheader.
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(INVITE_SUBJECT)}</title></head>
<body style="margin:0;padding:24px 16px;background:#ffffff;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
<div style="max-width:560px;">
${p(`Hi ${name},`)}
${before.map(p).join("\n")}
<p style="margin:0 0 16px;"><a href="${escapeHtml(link)}" style="color:#c2410c;font-weight:600;">${LINK_TEXT}</a></p>
${after.map(p).join("\n")}
<p style="margin:0 0 28px;">Thanks,<br>Mohnish<br>Founder, Evntly</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#6e6e73;">You're getting this because you joined the Evntly vendor waitlist and asked to hear about early access. <a href="${escapeHtml(unsub)}" style="color:#6e6e73;">Unsubscribe</a>.<br>${escapeHtml(SENDER_IDENTITY)}. ${CONTACT_EMAIL}</p>
</div>
</body></html>`;

  const text = [
    `Hi ${name},`,
    "",
    ...before.flatMap((line) => [line, ""]).slice(0, -1),
    link,
    "",
    ...after.flatMap((line) => [line, ""]),
    "Thanks,",
    "Mohnish",
    "Founder, Evntly",
    "",
    "--",
    "You're getting this because you joined the Evntly vendor waitlist and asked to hear about early access.",
    `Unsubscribe: ${unsub}`,
    `${SENDER_IDENTITY}. ${CONTACT_EMAIL}`,
  ].join("\n");

  return { subject: INVITE_SUBJECT, html, text };
}
