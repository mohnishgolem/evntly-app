import { SITE_URL } from "@/lib/config";

// The link a vendor pastes into their own Google Business Profile as its
// Booking link — the Fresha model: customers tap "Book" on Google and land on
// the vendor's Evntly listing with the booking form already open.
//
// ?book=1 opens the booking form (see lib/booking-intent.ts; the proxy strips
// it and keeps the rest). utm_source=google & utm_medium=gbp_booking mark the
// visit as coming from a Google Business Profile for analytics. (Our own
// page_views only store source tags on founding pages today.)
export const GOOGLE_BOOKING_UTM = { utm_source: "google", utm_medium: "gbp_booking" } as const;

export function googleBookingLink(vendorId: string) {
  const url = new URL(`/vendor/${encodeURIComponent(vendorId)}`, SITE_URL);
  url.searchParams.set("book", "1");
  for (const [k, v] of Object.entries(GOOGLE_BOOKING_UTM)) url.searchParams.set(k, v);
  return url.toString();
}
