// How a vendor prices: by the hour, a fixed price per event, a starting
// price, or quote-only. Stored as service_providers.pricing_model with the
// amount in hourly_rate (hourly) or base_price (fixed / from). Every price a
// customer sees goes through vendorPrice() so the wording stays consistent.

import { formatAudDollars } from "@/lib/payments/money";

export const PRICING_MODELS = ["hourly", "fixed", "from", "quote"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const PRICING_MODEL_OPTIONS: { value: PricingModel; label: string; hint: string }[] = [
  { value: "hourly", label: "Hourly rate", hint: "e.g. $150/hr" },
  { value: "fixed", label: "Fixed price", hint: "e.g. $800 per event" },
  { value: "from", label: "Starting from", hint: "e.g. from $500" },
  { value: "quote", label: "Custom quote", hint: "Customers contact you for pricing" },
];

/** Hours a typical booking runs, for turning an hourly rate into a cost. */
export const TYPICAL_BOOKING_HOURS = 4;

export function isPricingModel(value: unknown): value is PricingModel {
  return typeof value === "string" && (PRICING_MODELS as readonly string[]).includes(value);
}

export type PricedListing = {
  pricing_model?: string | null;
  hourly_rate?: number | string | null;
  base_price?: number | string | null;
};

function positive(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The listing's model; rows from before pricing models existed are hourly. */
export function pricingModelOf(v: PricedListing): PricingModel {
  return isPricingModel(v.pricing_model) ? v.pricing_model : "hourly";
}

export type VendorPrice = {
  model: PricingModel;
  /** Dollars, or null for quote-only (or a listing missing its amount). */
  amount: number | null;
  /** Short form for cards and lists: "$150/hr", "$800 per event", "From $500", "Contact for pricing". */
  label: string;
  /** Main figure and its suffix, for the large price on the listing page. */
  figure: string;
  suffix: string;
  /** Shortest form, for map pins: "$150/hr", "$800/event", "From $500", "Quote". */
  compact: string;
  /** Spoken form for screen readers: "$150 per hour", "$800 per event", … */
  spoken: string;
};

export function vendorPrice(v: PricedListing): VendorPrice {
  const model = pricingModelOf(v);
  if (model === "hourly") {
    const amount = positive(v.hourly_rate);
    if (amount == null) return quoteOnly(model);
    const figure = formatAudDollars(amount);
    return { model, amount, label: `${figure}/hr`, figure, suffix: "/ hr", compact: `${figure}/hr`, spoken: `${figure} per hour` };
  }
  if (model === "fixed" || model === "from") {
    const amount = positive(v.base_price);
    if (amount == null) return quoteOnly(model);
    const figure = formatAudDollars(amount);
    return model === "fixed"
      ? { model, amount, label: `${figure} per event`, figure, suffix: "per event", compact: `${figure}/event`, spoken: `${figure} per event` }
      : { model, amount, label: `From ${figure}`, figure: `From ${figure}`, suffix: "", compact: `From ${figure}`, spoken: `from ${figure}` };
  }
  return quoteOnly(model);
}

function quoteOnly(model: PricingModel): VendorPrice {
  return {
    model,
    amount: null,
    label: "Contact for pricing",
    figure: "Contact for pricing",
    suffix: "",
    compact: "Quote",
    spoken: "contact for pricing",
  };
}

/**
 * The price for running text, lower-case: "from $150/hr", "$800 per event",
 * "from $500". Null for quote-only, so callers can leave the price out.
 */
export function priceSummary(v: PricedListing): string | null {
  const p = vendorPrice(v);
  if (p.amount == null) return null;
  if (p.model === "hourly") return `from ${p.label}`;
  if (p.model === "from") return `from ${formatAudDollars(p.amount)}`;
  return p.label;
}

/**
 * A rough cost for one booking, for budget matching and the $–$$$$ tier:
 * hourly × typical hours, or the fixed / starting price. Null when there's
 * nothing to estimate (quote-only), so the vendor isn't filtered out on cost.
 */
export function estimatedBookingCost(v: PricedListing): number | null {
  const { model, amount } = vendorPrice(v);
  if (amount == null) return null;
  return model === "hourly" ? amount * TYPICAL_BOOKING_HOURS : amount;
}

/** "$" to "$$$$" from the estimated booking cost; null for quote-only. */
export function priceTierFor(v: PricedListing): string | null {
  const cost = estimatedBookingCost(v);
  if (cost == null) return null;
  // Same bands as the old hourly tiers (80/150/250 per hour × typical hours).
  const perHour = cost / TYPICAL_BOOKING_HOURS;
  if (perHour < 80) return "$";
  if (perHour < 150) return "$$";
  if (perHour < 250) return "$$$";
  return "$$$$";
}

export type PricingDraft = {
  pricingModel?: string;
  hourlyRate?: number | null;
  basePrice?: number | null;
};

export type PricingColumns = {
  pricing_model: PricingModel;
  hourly_rate: number | null;
  base_price: number | null;
};

/** True when the draft has everything its model needs (for the forms' Next / Save). */
export function pricingComplete(draft: PricingDraft) {
  return !("error" in pricingColumns(draft));
}

/**
 * Validates a form draft and returns the columns to save. Only the field the
 * model uses is kept; the others are cleared (the DB check requires this).
 */
export function pricingColumns(draft: PricingDraft): PricingColumns | { error: string } {
  const model: PricingModel = isPricingModel(draft.pricingModel) ? draft.pricingModel : "hourly";
  if (model === "quote") return { pricing_model: model, hourly_rate: null, base_price: null };
  const amount = positive(model === "hourly" ? draft.hourlyRate : draft.basePrice);
  if (amount == null) {
    return {
      error:
        model === "hourly"
          ? "Enter your hourly rate, or choose another way to price."
          : "Enter a price, or choose Custom quote.",
    };
  }
  if (amount > 1_000_000) return { error: "That price looks too high. Check the amount." };
  const rounded = Math.round(amount * 100) / 100;
  return model === "hourly"
    ? { pricing_model: model, hourly_rate: rounded, base_price: null }
    : { pricing_model: model, hourly_rate: null, base_price: rounded };
}
