import "server-only";
import { sendEmail } from "@/lib/email";
import { LEGAL_ENTITY } from "@/lib/legal/versions";
import { phoneAgentConfig, registrationLink } from "@/lib/phone-agent/config";
import type { LinkSender } from "@/lib/phone-agent/tools";

// Sends the registration link the vendor agreed to receive on the call.
// Spam Act 2003: identifies Evntly as the sender and includes a working way
// to opt out (SMS: reply STOP, handled by /api/phone-agent/sms; email: reply
// or call, actioned within 5 working days).

// ACMA (avoid-sending-spam, read 25 Nov 2026): identify the sender by legal
// name or name + ABN, include contact details, and a free unsubscribe that
// works for 30 days (we action it immediately). Sent from our own number, not
// an alphanumeric sender ID, because those can't receive STOP replies.
export const SMS_TEXT = (link: string) =>
  `Evntly (ABN 49 193 658 959): here's the link to list your business, as promised on our call: ${link} Questions? Call or text this number. Reply STOP to opt out.`;

export const sendRegistrationLink: LinkSender = async ({ channel, to, campaign }) => {
  const cfg = phoneAgentConfig();
  const link = registrationLink(cfg.linkBase, campaign);

  if (channel === "email") {
    await sendEmail({
      to,
      subject: "Your Evntly vendor link",
      heading: "List your business on Evntly",
      lines: [
        "Thanks for chatting with Evntly's AI assistant. Here's the link we promised.",
        "Build your listing preview in a few minutes. No account needed to start, and listing is free (no subscription, commission or booking fees today).",
        "Prefer us to set it up? Reply to this email and we'll prepare a draft for you to check.",
      ],
      cta: { label: "Start my listing", path: link },
      footer: `You're getting this because you asked for it on a call with Evntly's AI assistant. Sent by ${LEGAL_ENTITY}. To stop hearing from us, reply "unsubscribe" and we'll remove you straight away.`,
    });
    return { ok: true };
  }

  if (!cfg.twilio || !cfg.fromNumber) return { ok: false, error: "SMS isn't set up" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.twilio.sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.twilio.sid}:${cfg.twilio.token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: cfg.fromNumber, To: to, Body: SMS_TEXT(link) }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `Twilio ${res.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
};
