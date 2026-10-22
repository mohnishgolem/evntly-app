import { describe, expect, it } from "vitest";
import { opportunityStats, type OpportunityQuote } from "@/lib/matching/opportunities";

const NOW = Date.parse("2026-10-22T00:00:00Z");
const q = (over: Partial<OpportunityQuote>): OpportunityQuote => ({
  status: "pending",
  expires_at: "2026-10-29T00:00:00Z",
  quoted_amount: null,
  origin: "smart_match",
  created_at: "2026-10-20T00:00:00Z",
  ...over,
});

describe("opportunityStats", () => {
  it("is empty-safe", () => {
    expect(opportunityStats([], NOW)).toEqual({ received: 0, matched: 0, replyRate: null, conversionRate: null, bookedValue: 0 });
  });

  it("counts replies and conversions fairly", () => {
    const s = opportunityStats(
      [
        q({}), // still waiting — not counted either way
        q({ status: "quoted", quoted_amount: 900 }), // answered, customer still deciding
        q({ status: "accepted", quoted_amount: 1200 }),
        q({ status: "declined", origin: "vendor_profile" }),
        q({ status: "pending", expires_at: "2026-10-21T00:00:00Z" }), // expired unanswered
        q({ status: "expired", quoted_amount: 700 }), // quoted, not accepted in time
        q({ status: "cancelled" }), // customer withdrew — ignored
        q({ status: "accepted", quoted_amount: 5000, created_at: "2026-01-01T00:00:00Z" }), // outside 90 days
      ],
      NOW
    );
    expect(s.received).toBe(7);
    expect(s.matched).toBe(6);
    // decidable: quoted, accepted, declined, expired-unanswered, expired-quoted = 5; answered = 4
    expect(s.replyRate).toBeCloseTo(4 / 5);
    // priced & decided: accepted 1200, expired 700 → 1 of 2
    expect(s.conversionRate).toBe(0.5);
    expect(s.bookedValue).toBe(1200);
  });
});
