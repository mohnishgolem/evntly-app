import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchStripeEvent } from "@/lib/payments/server";
import { recordError } from "@/lib/error-report";

// Stripe → Evntly. Payment state changes ONLY here (never from the browser's
// return URL). Every event is signature-checked, recorded once in
// stripe_webhook_events, and a failure returns 500 so Stripe retries.
//
// STRIPE_WEBHOOK_SECRET: the platform endpoint (checkout, charges, transfers).
// STRIPE_CONNECT_WEBHOOK_SECRET: the "connected accounts" endpoint
// (account.updated) — both can point at this same URL.

async function verify(request: NextRequest, body: string): Promise<Stripe.Event | null> {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!stripe || !signature) return null;
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => !!s
  );
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(body, signature, secret);
    } catch {
      // try the next secret
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const event = await verify(request, body);
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  // Idempotency: Stripe can deliver an event more than once.
  const { data: seen } = await admin
    .from("stripe_webhook_events")
    .select("processed_at")
    .eq("event_id", event.id)
    .maybeSingle();
  if (seen?.processed_at) return NextResponse.json({ received: true, duplicate: true });
  if (!seen) await admin.from("stripe_webhook_events").insert({ event_id: event.id, type: event.type });

  try {
    await dispatchStripeEvent(event);
    await admin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("event_id", event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("stripe_webhook_events").update({ error: message.slice(0, 1000) }).eq("event_id", event.id);
    await recordError({ source: "server", message: `Stripe webhook ${event.type} failed: ${message}`, route: "/api/stripe/webhook" });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
