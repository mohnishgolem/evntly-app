// Money is integer cents everywhere (AUD). Never floats in the database.

export const CURRENCY = "aud" as const;
export const DEFAULT_COMMISSION_BPS = 700; // 7%

/** Evntly's share of a payment, rounded to the nearest cent. */
export function commissionCents(amountCents: number, commissionBps: number) {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error("Invalid amount");
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 3000) throw new Error("Invalid commission");
  return Math.round((amountCents * commissionBps) / 10_000);
}

/** What the vendor receives for a payment. Stripe's card fee is Evntly's cost. */
export function vendorPayoutCents(amountCents: number, commissionBps: number) {
  return amountCents - commissionCents(amountCents, commissionBps);
}

/** "$1,234.50" — whole dollars drop the cents. */
export function formatAud(cents: number) {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/** Parses "1,234.5" / "$1234" into cents; null when not a positive amount. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 ? cents : null;
}

/** Splits a total into a deposit + equal milestones that sum exactly. */
export function suggestSplit(totalCents: number, depositPercent: number, milestoneCount: number) {
  const deposit = depositPercent > 0 ? Math.round((totalCents * depositPercent) / 100) : 0;
  const rest = totalCents - deposit;
  const each = Math.floor(rest / milestoneCount);
  const amounts = Array.from({ length: milestoneCount }, (_, i) =>
    i === milestoneCount - 1 ? rest - each * (milestoneCount - 1) : each
  );
  return { deposit, milestones: amounts };
}
