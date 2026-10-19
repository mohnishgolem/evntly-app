import { describe, expect, it } from "vitest";
import { budgetBar, summarizeBudget } from "@/lib/budget";

describe("event budget", () => {
  const base = {
    budget: 10000,
    bookings: [
      { status: "confirmed", total_price: 3000 },
      { status: "completed", total_price: 1500 },
      { status: "cancelled", total_price: 9999 },
      { status: "pending", total_price: null },
    ],
    openQuotes: [{ quoted_amount: 1200 }, { quoted_amount: null }],
    items: [{ amount: 2500 }, { amount: 250.5 }],
  };

  it("adds bookings (not cancelled) and own costs, keeps open quotes separate", () => {
    const s = summarizeBudget(base);
    expect(s.booked).toBe(4500);
    expect(s.other).toBe(2750.5);
    expect(s.committed).toBe(7250.5);
    expect(s.remaining).toBe(2749.5);
    expect(s.quoted).toBe(1200);
    expect(s.remainingIfAccepted).toBe(1549.5);
    expect(s.overBudget).toBe(false);
  });

  it("flags going over budget", () => {
    const s = summarizeBudget({ ...base, budget: 5000 });
    expect(s.overBudget).toBe(true);
    expect(s.remaining).toBe(-2250.5);
  });

  it("scales the bar to the budget, or to spending when it's over", () => {
    expect(budgetBar(summarizeBudget(base))).toEqual({ booked: 45, other: 27.5, quoted: 12 });
    const over = budgetBar(summarizeBudget({ ...base, budget: 0 }));
    expect(over.booked + over.other + over.quoted).toBeCloseTo(100, 0);
  });
});
