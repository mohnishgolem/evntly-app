import "server-only";

// Invitation sending configuration, read from the environment.
//
//   BETA_INVITES_LIVE=true   required for real sends (test emails always work)
//   BETA_EMAIL_FROM          optional full sender, e.g. "Mohnish from Evntly <hello@evntlyapp.com>".
//                            When unset, invitations use the address from EMAIL_FROM (the
//                            existing verified sender) with the display name INVITE_FROM_NAME,
//                            falling back to hello@evntlyapp.com.
//   BETA_EMAIL_REPLY_TO      optional; defaults to hello@evntlyapp.com
export const INVITE_FROM_NAME = "Mohnish from Evntly";
export const DEFAULT_BETA_FROM = `${INVITE_FROM_NAME} <hello@evntlyapp.com>`;

/** The bare address from "Name <addr>" or "addr"; null if there isn't one. */
export function senderAddress(from: string | undefined | null) {
  const value = from?.trim();
  if (!value) return null;
  const match = value.match(/<([^<>\s]+@[^<>\s]+)>\s*$/) ?? value.match(/^([^<>\s]+@[^<>\s]+)$/);
  return match ? match[1] : null;
}

export function inviteSendingStatus() {
  const explicit = process.env.BETA_EMAIL_FROM?.trim();
  const address = senderAddress(process.env.EMAIL_FROM);
  const from = explicit || (address ? `${INVITE_FROM_NAME} <${address}>` : DEFAULT_BETA_FROM);
  return {
    live: process.env.BETA_INVITES_LIVE === "true",
    resendConfigured: !!process.env.RESEND_API_KEY,
    webhookConfigured: !!process.env.RESEND_WEBHOOK_SECRET,
    from,
    replyTo: process.env.BETA_EMAIL_REPLY_TO || "hello@evntlyapp.com",
  };
}
