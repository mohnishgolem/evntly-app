import "server-only";
import Stripe from "stripe";

// Server-only Stripe client. Created lazily so builds and pages work without
// keys; every payment path checks paymentsAvailable() first.
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { appInfo: { name: "Evntly" }, maxNetworkRetries: 2 });
  return client;
}

/** For tests: inject a client that talks to a fake fetch. */
export function setStripeForTesting(stripe: Stripe | null) {
  client = stripe;
}

export const isLiveKey = () => process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
