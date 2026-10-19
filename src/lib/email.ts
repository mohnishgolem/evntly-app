import { after } from "next/server";
import { Resend } from "resend";
import { SITE_URL } from "@/lib/config";

// Transactional notification emails. Sending is scheduled with after() so a
// slow or failing email provider never delays or fails the user's action —
// the DB write is the source of truth, the email is a best-effort nudge.
//
// Needs RESEND_API_KEY and EMAIL_FROM (an address on a domain verified in
// Resend, e.g. "Evntly <notifications@evntly.com.au>"). Without them, emails
// are skipped with a warning so local dev and previews keep working.

type Notification = {
  to: string | null | undefined;
  subject: string;
  heading: string;
  // Plain-text paragraphs; user-supplied values are escaped before rendering.
  lines: string[];
  // Optional quoted block, e.g. a message preview or a vendor's pitch.
  quote?: string | null;
  cta: { label: string; path: string };
};

let client: Resend | null = null;

function getClient() {
  if (!process.env.RESEND_API_KEY) return null;
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value: string, max = 280) {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function renderHtml({ heading, lines, quote, cta }: Notification) {
  const url = `${SITE_URL}${cta.path}`;
  const paragraphs = lines
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3a3a3c;">${escapeHtml(line)}</p>`)
    .join("");
  const quoteBlock = quote
    ? `<div style="margin:4px 0 18px;padding:12px 16px;border-left:3px solid #e8604a;background:#faf7f6;font-size:14px;line-height:1.55;color:#3a3a3c;white-space:pre-wrap;">${escapeHtml(truncate(quote))}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px;">
        <tr><td>
          <div style="font-size:20px;font-weight:700;color:#e8604a;margin-bottom:24px;">Evntly</div>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1d1d1f;">${escapeHtml(heading)}</h1>
          ${paragraphs}
          ${quoteBlock}
          <a href="${url}" style="display:inline-block;margin-top:6px;padding:12px 22px;background:#e8604a;color:#ffffff;text-decoration:none;border-radius:999px;font-size:15px;font-weight:600;">${escapeHtml(cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#8e8e93;">You're getting this because you have an account on Evntly.</p>
    </td></tr>
  </table>
</body></html>`;
}

function renderText({ heading, lines, quote, cta }: Notification) {
  return [heading, "", ...lines, ...(quote ? ["", `"${truncate(quote)}"`] : []), "", `${cta.label}: ${SITE_URL}${cta.path}`].join("\n");
}

// Reserved, never-deliverable domains (RFC 2606/6761) used by seeded and test
// accounts, e.g. the demo vendors on evntly.test. Sending to them can only
// bounce, which hurts the sending domain's reputation with Resend.
const UNDELIVERABLE_DOMAIN = /(\.(test|example|invalid|localhost)|@example\.(com|net|org))$/i;

export function notify(notification: Notification) {
  if (!isDeliverable(notification.to)) return;
  after(() => sendEmail(notification));
}

function isDeliverable(to: string | null | undefined) {
  const address = to?.trim();
  return !!address && !UNDELIVERABLE_DOMAIN.test(address);
}

/** Sends now and resolves when done; never throws. Prefer notify() in actions. */
export async function sendEmail(notification: Notification) {
  const to = notification.to?.trim();
  if (!to || !isDeliverable(to)) return;
  const resend = getClient();
  const from = process.env.EMAIL_FROM;
  if (!resend || !from) {
    console.warn(`[email] RESEND_API_KEY/EMAIL_FROM not set — skipped "${notification.subject}"`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: notification.subject,
      html: renderHtml(notification),
      text: renderText(notification),
    });
    if (error) console.error(`[email] failed "${notification.subject}":`, error.message);
  } catch (err) {
    console.error(`[email] failed "${notification.subject}":`, err);
  }
}

export function formatEventDate(date: string | null | undefined) {
  if (!date) return "a date to be confirmed";
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function formatAmount(amount: number | null | undefined) {
  return amount == null ? "" : `$${Number(amount).toLocaleString("en-AU")}`;
}
