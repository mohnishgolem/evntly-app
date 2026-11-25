// Shared by Admin → Growth and its server actions.

export const SPEND_CHANNELS = ["meta_ads", "google_ads", "instagram", "events", "print", "partnerships", "referral_rewards", "tools", "other", "ai_phone"] as const;
export type SpendChannel = (typeof SPEND_CHANNELS)[number];

export type GrowthDay = {
  day: string;
  prospects_added: number;
  vendors_contacted: number;
  replies: number;
  listing_drafts: number;
  vendor_registrations: number;
  listings_approved: number;
  listings_completed: number;
  customer_registrations: number;
  event_plans: number;
  genuine_enquiries: number;
  confirmed_bookings: number;
  spend_cents: number | string;
};

export const GROWTH_MEASURES: { key: Exclude<keyof GrowthDay, "day" | "spend_cents">; label: string; side: "vendor" | "customer" }[] = [
  { key: "prospects_added", label: "Vendor prospects", side: "vendor" },
  { key: "vendors_contacted", label: "Vendors contacted", side: "vendor" },
  { key: "replies", label: "Replies", side: "vendor" },
  { key: "listing_drafts", label: "Listing drafts", side: "vendor" },
  { key: "vendor_registrations", label: "Vendor registrations (verified)", side: "vendor" },
  { key: "listings_approved", label: "Approved listings", side: "vendor" },
  { key: "listings_completed", label: "Completed listings", side: "vendor" },
  { key: "customer_registrations", label: "Customer registrations", side: "customer" },
  { key: "event_plans", label: "Event plans created", side: "customer" },
  { key: "genuine_enquiries", label: "Genuine enquiries", side: "customer" },
  { key: "confirmed_bookings", label: "Confirmed bookings", side: "customer" },
];

/** Sum of a measure over the most recent `days` rows (rows are newest first). */
export function sumRecent(rows: GrowthDay[], key: keyof GrowthDay, days: number): number {
  return rows.slice(0, days).reduce((total, r) => total + Number(r[key] ?? 0), 0);
}

/** "12%" or "—" when there's nothing to divide by. */
export function rate(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** Spend per outcome in dollars, or "—" with no spend or no outcomes (never a made-up cost). */
export function costPer(spendCents: number, outcomes: number): string {
  if (spendCents <= 0 || outcomes <= 0) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(spendCents / 100 / outcomes);
}
