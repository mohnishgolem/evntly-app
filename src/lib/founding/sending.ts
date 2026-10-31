import "server-only";

// Invitation sending configuration, read from the environment.
//
//   BETA_INVITES_LIVE=true   required for real sends (test emails always work)
//   BETA_EMAIL_FROM          optional sender, e.g. "Mohnish from Evntly <hello@evntlyapp.com>";
//                            falls back to EMAIL_FROM. Must be on a Resend-verified domain.
//   BETA_EMAIL_REPLY_TO      optional; defaults to hello@evntlyapp.com
export function inviteSendingStatus() {
  const from = process.env.BETA_EMAIL_FROM || process.env.EMAIL_FROM || null;
  return {
    live: process.env.BETA_INVITES_LIVE === "true",
    resendConfigured: !!process.env.RESEND_API_KEY,
    webhookConfigured: !!process.env.RESEND_WEBHOOK_SECRET,
    from,
    replyTo: process.env.BETA_EMAIL_REPLY_TO || "hello@evntlyapp.com",
  };
}
