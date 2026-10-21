// Event Board logic: which vendors to suggest for an event, and where each
// vendor stands with it (suggested → shortlisted → requested → quoted →
// booked → confirmed). Pure functions so the rules are unit-tested; the page
// feeds them rows it has already read under RLS.
//
// Matching only filters on information that actually exists — a vendor with
// no coordinates, or an event with no budget, isn't excluded for it.

import type { PublicVendor } from "@/lib/vendor-columns";
import { effectiveQuoteStatus } from "@/lib/quote-expiry";

/** Hours a typical booking runs, for turning an hourly rate into a cost. */
export const TYPICAL_BOOKING_HOURS = 4;
/** Used when a vendor hasn't set a service radius. */
export const DEFAULT_SERVICE_RADIUS_KM = 40;

export type MatchableVendor = Pick<
  PublicVendor,
  | "id"
  | "service_type"
  | "status"
  | "available"
  | "unavailable_dates"
  | "weekly_unavailable_days"
  | "latitude"
  | "longitude"
  | "service_radius_km"
  | "hourly_rate"
>;

export type MatchableEvent = {
  event_date: string;
  budget_total: number;
  required_services: string[];
  latitude: number | null;
  longitude: number | null;
};

/** 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD" calendar date. */
export function dayOfWeek(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isAvailableOn(vendor: MatchableVendor, isoDate: string, bookedIds: Set<string>) {
  if (vendor.status !== "approved" || vendor.available === false) return false;
  if (bookedIds.has(vendor.id)) return false;
  if ((vendor.unavailable_dates ?? []).includes(isoDate)) return false;
  return !(vendor.weekly_unavailable_days ?? []).includes(dayOfWeek(isoDate));
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function servesLocation(vendor: MatchableVendor, event: MatchableEvent) {
  if (event.latitude == null || event.longitude == null) return true;
  if (vendor.latitude == null || vendor.longitude == null) return true;
  const radius = vendor.service_radius_km || DEFAULT_SERVICE_RADIUS_KM;
  return distanceKm(event.latitude, event.longitude, vendor.latitude, vendor.longitude) <= radius;
}

/** The event budget split evenly across its vendor categories. */
export function categoryBudget(event: MatchableEvent) {
  const n = event.required_services.length;
  if (!event.budget_total || n === 0) return null;
  return event.budget_total / n;
}

export function estimatedCost(vendor: Pick<MatchableVendor, "hourly_rate">) {
  return vendor.hourly_rate > 0 ? vendor.hourly_rate * TYPICAL_BOOKING_HOURS : null;
}

export function withinBudget(vendor: MatchableVendor, event: MatchableEvent) {
  const share = categoryBudget(event);
  const cost = estimatedCost(vendor);
  if (share == null || cost == null) return true;
  return cost <= share;
}

export function matchesEvent(vendor: MatchableVendor, event: MatchableEvent, bookedIds: Set<string>) {
  return (
    isAvailableOn(vendor, event.event_date, bookedIds) &&
    servesLocation(vendor, event) &&
    withinBudget(vendor, event)
  );
}

/** "$" to "$$$$" by hourly rate, for the compact vendor row. */
export function priceTier(hourlyRate: number) {
  if (hourlyRate < 80) return "$";
  if (hourlyRate < 150) return "$$";
  if (hourlyRate < 250) return "$$$";
  return "$$$$";
}

// ── Vendor status on this event ─────────────────────────────────────────

export type TeamStatus = "confirmed" | "booked" | "quoted" | "requested" | "declined" | "shortlisted" | "suggested";

/** Display order within a category: most committed first. */
export const TEAM_STATUS_ORDER: TeamStatus[] = [
  "confirmed",
  "booked",
  "quoted",
  "requested",
  "shortlisted",
  "declined",
  "suggested",
];

export const TEAM_STATUS_LABEL: Record<TeamStatus, string> = {
  confirmed: "Confirmed",
  booked: "Awaiting vendor",
  quoted: "Quote received",
  requested: "Quote requested",
  declined: "Declined",
  shortlisted: "Shortlisted",
  suggested: "Suggested",
};

export type BoardQuote = {
  id: string;
  vendor_id: string | null;
  service_type: string | null;
  status: string;
  expires_at: string | null;
  quoted_amount: number | null;
  created_at: string;
};

export type BoardBooking = {
  id: string;
  provider_id: string;
  service_type: string;
  status: string;
  total_price: number | null;
};

export type VendorStanding = {
  status: TeamStatus;
  /** Latest live quote, if any — accepted quotes become bookings. */
  quote?: BoardQuote;
  booking?: BoardBooking;
};

/**
 * Where one vendor stands on this event. Bookings outrank quotes, quotes
 * outrank the shortlist. Cancelled bookings and expired/cancelled quotes
 * drop back to whatever is left (usually the shortlist).
 */
export function vendorStanding(
  vendorId: string,
  {
    bookings,
    quotes,
    shortlisted,
  }: { bookings: BoardBooking[]; quotes: BoardQuote[]; shortlisted: Set<string> },
  now = Date.now()
): VendorStanding {
  const booking = bookings.find((b) => b.provider_id === vendorId && b.status !== "cancelled" && b.status !== "declined");
  if (booking) {
    const confirmed = booking.status === "confirmed" || booking.status === "completed";
    return { status: confirmed ? "confirmed" : "booked", booking };
  }

  const mine = quotes
    .filter((q) => q.vendor_id === vendorId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const live = mine.find((q) => {
    const s = effectiveQuoteStatus(q, now);
    return s === "quoted" || s === "pending";
  });
  if (live) return { status: effectiveQuoteStatus(live, now) === "quoted" ? "quoted" : "requested", quote: live };

  if (shortlisted.has(vendorId)) return { status: "shortlisted" };

  const declined = mine.find((q) => q.status === "declined");
  if (declined) return { status: "declined", quote: declined };

  return { status: "suggested" };
}

/** A category is filled once any vendor in it is booked (pending or confirmed). */
export function filledCategories(bookings: BoardBooking[]) {
  return new Set(
    bookings.filter((b) => b.status !== "cancelled" && b.status !== "declined").map((b) => b.service_type)
  );
}

/** Planning progress: share of the event's categories with a confirmed vendor. */
export function planningProgress(requiredServices: string[], bookings: Pick<BoardBooking, "service_type" | "status">[]) {
  if (requiredServices.length === 0) return { done: 0, total: 0, percent: 0 };
  const confirmed = new Set(
    bookings.filter((b) => b.status === "confirmed" || b.status === "completed").map((b) => b.service_type)
  );
  const done = requiredServices.filter((s) => confirmed.has(s)).length;
  return { done, total: requiredServices.length, percent: Math.round((done / requiredServices.length) * 100) };
}

// ── "Your next step" ────────────────────────────────────────────────────

export type NextStep =
  | { kind: "add-categories" }
  | { kind: "review-quote"; service: string; count: number }
  | { kind: "pay"; bookingId: string; vendorName: string }
  | { kind: "find"; service: string; available: number }
  | { kind: "request-quotes"; service: string; shortlisted: number }
  | { kind: "awaiting"; service: string }
  | { kind: "event-day" }
  | { kind: "review-vendors" };

/**
 * The single most useful thing to do now. Things waiting on the customer
 * (a quote to accept, a payment to make) come before finding new vendors.
 */
export function nextStep({
  requiredServices,
  availableByService,
  bookings,
  quotes,
  shortlistByService,
  paymentDueBookingId,
  paymentDueVendorName,
  eventPast,
  now = Date.now(),
}: {
  requiredServices: string[];
  availableByService: Map<string, number>;
  bookings: BoardBooking[];
  quotes: BoardQuote[];
  shortlistByService: Map<string, number>;
  paymentDueBookingId?: string | null;
  paymentDueVendorName?: string | null;
  eventPast: boolean;
  now?: number;
}): NextStep {
  if (eventPast) return { kind: "review-vendors" };
  if (requiredServices.length === 0) return { kind: "add-categories" };

  const filled = filledCategories(bookings);
  const quotedByService = new Map<string, number>();
  for (const q of quotes) {
    if (effectiveQuoteStatus(q, now) !== "quoted" || !q.service_type || filled.has(q.service_type)) continue;
    quotedByService.set(q.service_type, (quotedByService.get(q.service_type) ?? 0) + 1);
  }
  const firstQuoted = requiredServices.find((s) => quotedByService.has(s));
  if (firstQuoted) return { kind: "review-quote", service: firstQuoted, count: quotedByService.get(firstQuoted)! };

  if (paymentDueBookingId) {
    return { kind: "pay", bookingId: paymentDueBookingId, vendorName: paymentDueVendorName ?? "your vendor" };
  }

  const open = requiredServices.filter((s) => !filled.has(s));
  const requestedServices = new Set(
    quotes.filter((q) => effectiveQuoteStatus(q, now) === "pending").map((q) => q.service_type)
  );
  for (const s of open) {
    if (requestedServices.has(s)) continue;
    const shortlisted = shortlistByService.get(s) ?? 0;
    if (shortlisted > 0) return { kind: "request-quotes", service: s, shortlisted };
    return { kind: "find", service: s, available: availableByService.get(s) ?? 0 };
  }
  if (open.length > 0) return { kind: "awaiting", service: open[0] };
  return { kind: "event-day" };
}

// ── Payments ────────────────────────────────────────────────────────────

export type BoardPlan = { id: string; booking_id: string; status: string; total_cents: number };
export type BoardMilestone = {
  plan_id: string;
  kind: string;
  amount_cents: number;
  funding_status: string;
  payout_status: string;
  work_status: string;
};

export type PaymentSummary = {
  label: string;
  tone: "neutral" | "attention" | "active" | "success";
  /** The customer has something to do (agree to the plan or pay). */
  actionDue: boolean;
  paidCents: number;
  releasedCents: number;
  totalCents: number;
};

/**
 * One line per booking. "Released" only ever counts milestones whose
 * payout_status is "paid" — set by the Stripe transfer webhook, never by the
 * app — and "paid" only counts funding the checkout webhook confirmed.
 */
export function paymentSummary(plan: BoardPlan | undefined, milestones: BoardMilestone[]): PaymentSummary {
  const empty = { paidCents: 0, releasedCents: 0, totalCents: plan?.total_cents ?? 0 };
  if (!plan || plan.status === "cancelled") {
    return { label: "No payment plan yet", tone: "neutral", actionDue: false, ...empty };
  }
  if (plan.status === "proposed") {
    return { label: "Payment plan to review", tone: "attention", actionDue: true, ...empty };
  }
  if (plan.status === "changes_requested") {
    return { label: "Waiting for the vendor's updated plan", tone: "neutral", actionDue: false, ...empty };
  }

  const live = milestones.filter((m) => m.plan_id === plan.id && m.work_status !== "cancelled");
  const paidCents = live
    .filter((m) => m.funding_status === "funded" || m.payout_status === "paid")
    .reduce((s, m) => s + m.amount_cents, 0);
  const releasedCents = live.filter((m) => m.payout_status === "paid").reduce((s, m) => s + m.amount_cents, 0);
  const totalCents = live.reduce((s, m) => s + m.amount_cents, 0) || plan.total_cents;
  const sums = { paidCents, releasedCents, totalCents };

  if (live.some((m) => m.work_status === "disputed")) {
    return { label: "Payment on hold (disputed)", tone: "attention", actionDue: false, ...sums };
  }
  if (live.some((m) => m.funding_status === "failed")) {
    return { label: "A payment didn't go through", tone: "attention", actionDue: true, ...sums };
  }
  if (totalCents > 0 && releasedCents >= totalCents) {
    return { label: "Paid in full", tone: "success", actionDue: false, ...sums };
  }
  const depositDue = live.some((m) => m.kind === "deposit" && m.funding_status === "unfunded");
  const approvedUnpaid = live.some((m) => m.work_status === "approved" && m.funding_status === "unfunded");
  const reviewDue = live.some((m) => m.work_status === "submitted");
  if (depositDue) return { label: "Deposit due", tone: "attention", actionDue: true, ...sums };
  if (approvedUnpaid) return { label: "Payment due", tone: "attention", actionDue: true, ...sums };
  if (reviewDue) return { label: "Milestone to review", tone: "attention", actionDue: true, ...sums };
  return { label: paidCents > 0 ? "Paid to Evntly, held" : "Payment plan agreed", tone: "active", actionDue: false, ...sums };
}
