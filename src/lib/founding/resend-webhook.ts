import { createHmac, timingSafeEqual } from "node:crypto";

// Resend signs webhooks the Svix way: HMAC-SHA256 over
// "<svix-id>.<svix-timestamp>.<raw body>" with the base64 secret after
// "whsec_"; svix-signature holds one or more "v1,<base64>" entries.
const TOLERANCE_SECONDS = 5 * 60;

export function verifyResendWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type DeliveryStatus = "sent" | "delivered" | "delivery_delayed" | "bounced" | "complained" | "failed";

export type InvitationDeliveryUpdate =
  | { delivery_status: DeliveryStatus }
  | { opened: true }
  | { clicked: true };

/** Maps a Resend event type to what we record on the invitation, or null to ignore. */
export function deliveryUpdateFor(type: string): InvitationDeliveryUpdate | null {
  switch (type) {
    case "email.sent":
      return { delivery_status: "sent" };
    case "email.delivered":
      return { delivery_status: "delivered" };
    case "email.delivery_delayed":
      return { delivery_status: "delivery_delayed" };
    case "email.bounced":
      return { delivery_status: "bounced" };
    case "email.complained":
      return { delivery_status: "complained" };
    case "email.failed":
      return { delivery_status: "failed" };
    case "email.opened":
      return { opened: true };
    case "email.clicked":
      return { clicked: true };
    default:
      return null;
  }
}

// Resend doesn't guarantee event order. A later-stage status always wins, so a
// late "sent" or "delivered" never hides a bounce or a spam complaint.
const STAGE: Record<DeliveryStatus, number> = {
  sent: 0,
  delivery_delayed: 1,
  delivered: 2,
  failed: 3,
  bounced: 3,
  complained: 4,
};

export function shouldReplaceDeliveryStatus(current: string | null | undefined, next: DeliveryStatus) {
  if (!current || !(current in STAGE)) return true;
  return STAGE[next] >= STAGE[current as DeliveryStatus];
}
