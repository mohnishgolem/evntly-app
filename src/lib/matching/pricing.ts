// Price estimates for matching, in integer cents. Only the vendor's own
// numbers are used: their packages, else their listed hourly rate, plus the
// travel fee they set. Nothing here is a quote — the UI always labels it an
// estimate, and the vendor's quote is what gets booked.

/** Customers pay no booking fee today; Evntly's commission comes out of the vendor's side. */
export const CUSTOMER_PLATFORM_FEE_BPS = 0;

/** Hours assumed when an event has no times yet (labelled in the estimate). */
export const ASSUMED_EVENT_HOURS = 4;

export type MatchPackage = {
  id: string;
  name: string;
  price_cents: number;
  /** null = flat package, not sold by the hour. */
  included_hours: number | null;
  extra_hour_cents: number | null;
  inclusions: string[];
  delivery_days: number | null;
  deposit_percent: number | null;
  active: boolean;
};

export type PricedVendor = {
  hourly_rate: number | string | null;
  min_booking_hours: number | string | null;
  free_travel_km: number | null;
  travel_fee_cents_per_km: number | null;
};

export type PriceEstimate = {
  basis: "package" | "hourly";
  packageId?: string;
  packageName?: string;
  inclusions: string[];
  /** Hours the price covers (null for flat packages). */
  billedHours: number | null;
  serviceCents: number;
  travelCents: number;
  platformFeeCents: number;
  totalCents: number;
  /** Short qualifiers shown under the price ("Minimum 5 hours"). */
  notes: string[];
  /** True when the event had no times and ASSUMED_EVENT_HOURS was used. */
  assumedHours: boolean;
};

const num = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number(v));

/** Bill in half hours, rounding up. */
function roundUpHalfHour(h: number) {
  return Math.ceil(h * 2 - 1e-9) / 2;
}

/**
 * Travel beyond the vendor's free radius, charged per km each way (the
 * vendor's settings page says so). Distance is rounded to the nearest km.
 */
export function travelFeeCents(vendor: PricedVendor, distanceKm: number | null) {
  const rate = vendor.travel_fee_cents_per_km ?? 0;
  if (distanceKm == null || rate <= 0) return 0;
  const chargeable = Math.max(0, Math.round(distanceKm) - (vendor.free_travel_km ?? 0));
  return chargeable * 2 * rate;
}

/** A package's price for an event of `hours`, or null if it can't cover it. */
export function packagePriceCents(pkg: MatchPackage, hours: number, minHours: number | null) {
  if (pkg.included_hours == null) return { cents: pkg.price_cents, billedHours: null, extraHours: 0 };
  const billed = roundUpHalfHour(Math.max(hours, minHours ?? 0));
  const included = Number(pkg.included_hours);
  if (billed <= included) return { cents: pkg.price_cents, billedHours: included, extraHours: 0 };
  if (pkg.extra_hour_cents == null) return null;
  const extra = billed - included;
  return { cents: pkg.price_cents + Math.round(extra * pkg.extra_hour_cents), billedHours: billed, extraHours: extra };
}

function platformFee(cents: number) {
  return Math.round((cents * CUSTOMER_PLATFORM_FEE_BPS) / 10_000);
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

/**
 * Cheapest active package that covers the event; otherwise the hourly rate.
 * Returns null when the vendor has given us nothing to price with, or only
 * has packages too short for the event and no hourly rate.
 */
export function estimatePrice(
  vendor: PricedVendor,
  packages: MatchPackage[],
  eventHours: number | null,
  distanceKm: number | null
): PriceEstimate | null {
  const assumedHours = eventHours == null;
  const hours = eventHours ?? ASSUMED_EVENT_HOURS;
  const minHours = num(vendor.min_booking_hours);
  const travelCents = travelFeeCents(vendor, distanceKm);
  const travelNote = travelCents > 0 ? [`Includes ${money(travelCents)} travel`] : [];
  const assumedNote = assumedHours ? [`Based on ${ASSUMED_EVENT_HOURS} hours — add your event times for an exact estimate`] : [];

  let best: PriceEstimate | null = null;
  for (const pkg of packages) {
    if (!pkg.active) continue;
    const priced = packagePriceCents(pkg, hours, minHours);
    if (!priced) continue;
    const serviceCents = priced.cents;
    const fee = platformFee(serviceCents);
    const total = serviceCents + travelCents + fee;
    if (best && best.totalCents <= total) continue;
    const notes: string[] = [];
    if (priced.extraHours > 0) notes.push(`Includes ${priced.extraHours} extra hour${priced.extraHours === 1 ? "" : "s"}`);
    best = {
      basis: "package",
      packageId: pkg.id,
      packageName: pkg.name,
      inclusions: pkg.inclusions ?? [],
      billedHours: priced.billedHours,
      serviceCents,
      travelCents,
      platformFeeCents: fee,
      totalCents: total,
      notes: [...notes, ...travelNote, ...(pkg.included_hours == null ? [] : assumedNote)],
      assumedHours: assumedHours && pkg.included_hours != null,
    };
  }
  if (best) return best;

  const rate = num(vendor.hourly_rate);
  if (rate == null || rate <= 0) return null;
  const billed = roundUpHalfHour(Math.max(hours, minHours ?? 0));
  const serviceCents = Math.round(rate * 100 * billed);
  const fee = platformFee(serviceCents);
  const notes: string[] = [];
  if (minHours != null && minHours > hours) notes.push(`Minimum ${minHours} hours`);
  return {
    basis: "hourly",
    inclusions: [],
    billedHours: billed,
    serviceCents,
    travelCents,
    platformFeeCents: fee,
    totalCents: serviceCents + travelCents + fee,
    notes: [...notes, ...travelNote, ...assumedNote],
    assumedHours,
  };
}

/** True if any active package (or the hourly rate) can cover `hours`. */
export function coversDuration(vendor: PricedVendor, packages: MatchPackage[], hours: number | null) {
  if (hours == null) return true;
  if ((num(vendor.hourly_rate) ?? 0) > 0) return true;
  const active = packages.filter((p) => p.active);
  if (active.length === 0) return true; // nothing to judge by — pricing marks it pending instead
  return active.some((p) => packagePriceCents(p, hours, num(vendor.min_booking_hours)) != null);
}
