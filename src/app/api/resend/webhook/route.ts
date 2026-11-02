import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deliveryUpdateFor,
  logWebhook,
  shouldReplaceDeliveryStatus,
  verifyResendWebhook,
  type WebhookLogEntry,
} from "@/lib/founding/resend-webhook";

// Resend delivery events for founding-vendor invitations (sent, delivered,
// delayed, bounced, complained, failed, opened, clicked). The Svix signature
// is checked against the raw body with RESEND_WEBHOOK_SECRET: a bad or
// missing signature gets 400. Other event types, and events for emails that
// aren't invitations, get 200 and are ignored. Opens/clicks only arrive if
// tracking is enabled on the domain.
//
// Every request writes one log line (status, outcome, event type, matched)
// via logWebhook — never addresses, ids, the secret or the payload.
//
// Resend retries until it gets a 2xx, so the same event can arrive more than
// once. Every write here is idempotent: a repeat of an already-recorded state
// is a logged no-op ("duplicate"). A database error returns 500 so Resend
// retries instead of the update being lost.

function respond(entry: WebhookLogEntry, body: string | Record<string, unknown>) {
  logWebhook(entry);
  return typeof body === "string"
    ? new NextResponse(body, { status: entry.status })
    : NextResponse.json(body, { status: entry.status });
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return respond({ status: 503, outcome: "not_configured" }, "Not configured");

  const body = await request.text();
  if (body.length > 64_000) return respond({ status: 413, outcome: "too_large" }, "Too large");
  const valid = verifyResendWebhook(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
  );
  if (!valid) return respond({ status: 400, outcome: "invalid_signature" }, "Invalid signature");

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return respond({ status: 400, outcome: "bad_payload" }, "Bad JSON");
  }
  const type = typeof event.type === "string" ? event.type : undefined;
  const emailId = event.data?.email_id;
  const update = type ? deliveryUpdateFor(type) : null;
  if (!emailId || !update) return respond({ status: 200, outcome: "ignored", type }, { ignored: true });

  const admin = createAdminClient();
  if (!admin) return respond({ status: 503, outcome: "not_configured", type }, "Unavailable");
  const now = new Date().toISOString();

  const { data: invitation, error: lookupError } = await admin
    .from("beta_invitations")
    .select("id, waitlist_id, opened_at, clicked_at, delivery_status")
    .eq("resend_email_id", emailId)
    .maybeSingle();
  if (lookupError) return respond({ status: 500, outcome: "db_error", type }, "Try again");
  if (!invitation) return respond({ status: 200, outcome: "unmatched", type, matched: false }, { ignored: true });

  const matched = (outcome: WebhookLogEntry["outcome"], extra: Record<string, unknown> = {}) =>
    respond({ status: 200, outcome, type, matched: true }, { ok: true, ...extra });
  const failed = () => respond({ status: 500, outcome: "db_error", type, matched: true }, "Try again");

  if ("delivery_status" in update) {
    if (invitation.delivery_status === update.delivery_status) return matched("duplicate");
    if (!shouldReplaceDeliveryStatus(invitation.delivery_status, update.delivery_status)) {
      return matched("kept", { kept: invitation.delivery_status });
    }
    const { error } = await admin
      .from("beta_invitations")
      .update({ delivery_status: update.delivery_status, delivery_updated_at: now, updated_at: now })
      .eq("id", invitation.id);
    if (error) return failed();
    // A spam complaint or hard bounce means: never email this address again.
    if (update.delivery_status === "complained" || update.delivery_status === "bounced") {
      const { error: unsubError } = await admin
        .from("vendor_waitlist")
        .update({ invite_consent: false, unsubscribed_at: now, updated_at: now })
        .eq("id", invitation.waitlist_id)
        .is("unsubscribed_at", null);
      if (unsubError) return failed();
    }
    return matched("updated");
  }

  const column = "opened" in update ? "opened_at" : "clicked_at";
  if (invitation[column]) return matched("duplicate");
  const patch = column === "opened_at" ? { opened_at: now, updated_at: now } : { clicked_at: now, updated_at: now };
  const { error } = await admin.from("beta_invitations").update(patch).eq("id", invitation.id);
  if (error) return failed();
  return matched("updated");
}
