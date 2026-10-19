// Event budget maths for the event board's tracker. Kept pure so it's easy
// to test: bookings and quotes come from the app, extra costs are the
// organiser's own budget items.

export type BudgetInput = {
  budget: number;
  bookings: { status: string; total_price: number | null }[];
  /** Quotes awaiting the organiser's decision (effective status "quoted"). */
  openQuotes: { quoted_amount: number | null }[];
  items: { amount: number }[];
};

export type BudgetSummary = {
  budget: number;
  booked: number;
  other: number;
  quoted: number;
  committed: number;
  remaining: number;
  /** What's left if every open quote were accepted. */
  remainingIfAccepted: number;
  overBudget: boolean;
};

const money = (n: number | null | undefined) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export function summarizeBudget({ budget, bookings, openQuotes, items }: BudgetInput): BudgetSummary {
  const booked = bookings
    .filter((b) => b.status !== "cancelled")
    .reduce((sum, b) => sum + money(b.total_price), 0);
  const other = items.reduce((sum, i) => sum + money(i.amount), 0);
  const quoted = openQuotes.reduce((sum, q) => sum + money(q.quoted_amount), 0);
  const committed = booked + other;
  const remaining = money(budget) - committed;
  return {
    budget: money(budget),
    booked,
    other,
    quoted,
    committed,
    remaining,
    remainingIfAccepted: remaining - quoted,
    overBudget: remaining < 0,
  };
}

/** Bar segment widths (percent of the larger of budget or total). */
export function budgetBar(s: BudgetSummary) {
  const scale = Math.max(s.budget, s.committed + s.quoted, 1);
  const pct = (n: number) => Math.round((n / scale) * 1000) / 10;
  return { booked: pct(s.booked), other: pct(s.other), quoted: pct(s.quoted) };
}
