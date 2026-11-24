// "What could a few extra bookings mean?" — a scenario the vendor sets up
// themselves on the landing page. Deliberately NOT an earnings estimate:
//
//   * every number is the vendor's own input (their price, how many extra
//     bookings they want to imagine); we never supply demand, conversion
//     rates or market averages;
//   * the only Evntly figure used is the current fee, $0 (Vendor Service
//     Agreement, Schedule 1), so the result is simply price × bookings;
//   * the page labels it hypothetical and says plainly that Evntly can't
//     promise enquiries (see SCENARIO_DISCLAIMER).

export const SCENARIO_DISCLAIMER =
  "A hypothetical scenario using only the numbers you enter. It isn't a forecast or a promise of enquiries or bookings: Evntly is new in Sydney and customer enquiries are only just starting.";

/** Evntly's current fee on a booking (Schedule 1: $0). */
export const CURRENT_EVNTLY_FEE_RATE = 0;

export const SCENARIO_LIMITS = {
  price: { min: 50, max: 20_000, step: 50, initial: 800 },
  bookings: { min: 1, max: 8, step: 1, initial: 1 },
} as const;

export type Scenario = {
  pricePerBooking: number;
  extraBookingsPerMonth: number;
};

export type ScenarioResult = {
  monthly: number;
  yearly: number;
  evntlyFees: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function runScenario(s: Scenario): ScenarioResult {
  const price = clamp(Math.round(s.pricePerBooking), SCENARIO_LIMITS.price.min, SCENARIO_LIMITS.price.max);
  const bookings = clamp(Math.round(s.extraBookingsPerMonth), SCENARIO_LIMITS.bookings.min, SCENARIO_LIMITS.bookings.max);
  const monthly = price * bookings;
  return { monthly, yearly: monthly * 12, evntlyFees: Math.round(monthly * 12 * CURRENT_EVNTLY_FEE_RATE) };
}

export function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}
