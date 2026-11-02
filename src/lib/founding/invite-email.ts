import { SITE_URL } from "@/lib/config";
import { CLAIM_PATH } from "@/lib/founding/sources";

// The Founding Vendor invitation and its one follow-up reminder: Evntly's
// branded card, worded as a personal note from the founder, with one button,
// no images, no hidden preview text, no tracking parameters, and an
// invitation to reply. (Gmail decides tabs itself.)
//
// It's still a commercial email under the Spam Act 2003, so every copy says
// who sent it (Sai Mohnish Golem trading as Evntly, ABN, contact address),
// why the recipient is getting it (they joined the waitlist and opted in),
// and has a working unsubscribe link plus RFC 8058 one-click headers.
//
// The link carries only the invite token: the claim page records the source
// as the waitlist email from the token itself, so no utm_ parameters.

export const INVITE_SUBJECT = "You're Invited to Join Evntly – Early Vendor Access";
export const REMINDER_SUBJECT = "Following up on your Evntly invitation";
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

export const BUTTON_TEXT = "Create Your Free Vendor Account";

type Copy = { before: string[]; after: string[] };

// The approved invitation text. "Free vendor account" reflects current
// pricing (listing is free); nothing here promises it permanently.
const INVITE_COPY: Copy = {
  before: [
    "Thanks for joining the Evntly waitlist!",
    "I'm excited to invite you to become one of our first Sydney vendors.",
    "Your early access is now ready. You can create your free vendor account, set up your business profile and showcase your services to customers looking for event professionals.",
  ],
  after: [
    "We're starting with a group of founding vendors, and I'd love to have you involved.",
    "If you have any questions, just reply to this email.",
  ],
};

// Sent at most once, 3+ days after the invitation, only if they haven't
// signed up. Short, and makes it easy to say no.
const REMINDER_COPY: Copy = {
  before: [
    "Just following up on my invitation from a few days ago. Your early vendor access is still ready, and setting up your account and business profile takes about 10 minutes.",
  ],
  after: [
    "If anything's unclear, or you'd rather not join right now, just reply and let me know.",
  ],
};

function linkNote(expiry: string | null, reminder: boolean) {
  const parts = [
    expiry ? `This link is just for you and works until ${expiry}.` : "This link is just for you.",
    ...(reminder ? ["It replaces the link in my earlier email."] : []),
    "Every listing is reviewed by our team before it goes live.",
  ];
  return parts.join(" ");
}

function render(input: InviteEmailInput, subject: string, copy: Copy, reminder: boolean) {
  const link = claimUrl(input.token);
  const unsub = unsubscribeUrl(input.unsubscribeToken);
  const name = greetingName(input.firstName);
  const note = linkNote(expiryDate(input.expiresAt), reminder);
  const p = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a3a3c;">${escapeHtml(text)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px;">
        <tr><td>
          <div style="font-size:20px;font-weight:700;color:#e8604a;margin-bottom:24px;">Evntly</div>
          ${p(`Hi ${name},`)}
          ${copy.before.map(p).join("\n          ")}
          <a href="${escapeHtml(link)}" style="display:inline-block;margin:4px 0 10px;padding:13px 24px;background:#e8604a;color:#ffffff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:600;">${BUTTON_TEXT}</a>
          <p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#6e6e73;">${escapeHtml(note)}</p>
          ${copy.after.map(p).join("\n          ")}
          <p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:#3a3a3c;">Thanks,<br>Mohnish<br><span style="color:#6e6e73;">Founder, Evntly</span><br><a href="${SITE_URL}" style="color:#6e6e73;">evntlyapp.com</a></p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.55;color:#8e8e93;">
        You're getting this because you joined the Evntly vendor waitlist and asked to hear about early access.
        <a href="${escapeHtml(unsub)}" style="color:#8e8e93;">Unsubscribe</a> and we won't email you about it again.<br>
        ${escapeHtml(SENDER_IDENTITY)} · ${CONTACT_EMAIL}
      </p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `Hi ${name},`,
    "",
    ...copy.before.flatMap((line) => [line, ""]),
    `${BUTTON_TEXT}:`,
    link,
    "",
    note,
    "",
    ...copy.after.flatMap((line) => [line, ""]),
    "Thanks,",
    "Mohnish",
    "Founder, Evntly",
    SITE_URL,
    "",
    "--",
    "You're getting this because you joined the Evntly vendor waitlist and asked to hear about early access.",
    `Unsubscribe: ${unsub}`,
    `${SENDER_IDENTITY} · ${CONTACT_EMAIL}`,
  ].join("\n");

  return { subject, html, text };
}

export function renderInviteEmail(input: InviteEmailInput) {
  return render(input, INVITE_SUBJECT, INVITE_COPY, false);
}

export function renderReminderEmail(input: InviteEmailInput) {
  return render(input, REMINDER_SUBJECT, REMINDER_COPY, true);
}
