import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliveryUpdateFor, verifyResendWebhook } from "@/lib/founding/resend-webhook";

// Resend delivery events for founding-vendor invitations (delivered, bounced,
// complained, opened, clicked). Signed with RESEND_WEBHOOK_SECRET; anything
// unsigned is rejected. Events for other emails match no invitation and are
// ignored. Opens/clicks only arrive if tracking is enabled on the domain.
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Not configured", { status: 503 });

  const body = await request.text();
  if (body.length > 64_000) return new NextResponse("Too large", { status: 413 });
  const valid = verifyResendWebhook(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
  );
  if (!valid) return new NextResponse("Bad signature", { status: 401 });

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  const emailId = event.data?.email_id;
  const update = event.type ? deliveryUpdateFor(event.type) : null;
  if (!emailId || !update) return NextResponse.json({ ignored: true });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("Unavailable", { status: 503 });
  const now = new Date().toISOString();

  const { data: invitation } = await admin
    .from("beta_invitations")
    .select("id, waitlist_id, opened_at, clicked_at")
    .eq("resend_email_id", emailId)
    .maybeSingle();
  if (!invitation) return NextResponse.json({ ignored: true });

  if ("delivery_status" in update) {
    await admin
      .from("beta_invitations")
      .update({ delivery_status: update.delivery_status, delivery_updated_at: now, updated_at: now })
      .eq("id", invitation.id);
    // A spam complaint or hard bounce means: never email this address again.
    if (update.delivery_status === "complained" || update.delivery_status === "bounced") {
      await admin
        .from("vendor_waitlist")
        .update({ invite_consent: false, unsubscribed_at: now, updated_at: now })
        .eq("id", invitation.waitlist_id)
        .is("unsubscribed_at", null);
    }
  } else if ("opened" in update && !invitation.opened_at) {
    await admin.from("beta_invitations").update({ opened_at: now, updated_at: now }).eq("id", invitation.id);
  } else if ("clicked" in update && !invitation.clicked_at) {
    await admin.from("beta_invitations").update({ clicked_at: now, updated_at: now }).eq("id", invitation.id);
  }
  return NextResponse.json({ ok: true });
}
