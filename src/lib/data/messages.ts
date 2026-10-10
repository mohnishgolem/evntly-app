import { createClient } from "@/lib/supabase/server";

// "Payment" proxy: this app has no payment capture yet (see leakage-removal
// history), so a non-cancelled booking between this vendor and customer is
// the closest real signal that a deal is locked in on-platform. Swap this
// for an actual payment/escrow check once Stripe lands.
export async function hasBookingWithVendor(providerId: string, customerEmail: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id")
    .eq("provider_id", providerId)
    .eq("client_email", customerEmail)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  return !!data;
}
