// Vendor-facing numbers for Smart Opportunities, from the vendor's own quote
// requests (my_quote_requests). Pure, so the definitions are tested.

import { effectiveQuoteStatus } from "@/lib/quote-expiry";

export type OpportunityQuote = {
  status: string;
  expires_at: string | null;
  quoted_amount: number | null;
  origin: string | null;
  created_at: string;
};

export type OpportunityStats = {
  /** Requests received in the window (all sources). */
  received: number;
  /** Of those, how many came from customers' matches. */
  matched: number;
  /** Share answered (quoted or declined) out of those no longer waiting; null if none. */
  replyRate: number | null;
  /** Share of priced quotes the customer accepted; null if none decided. */
  conversionRate: number | null;
  /** Accepted quotes' total value, dollars. */
  bookedValue: number;
};

export const STATS_WINDOW_DAYS = 90;

export function opportunityStats(quotes: OpportunityQuote[], now = Date.now()): OpportunityStats {
  const since = now - STATS_WINDOW_DAYS * 86_400_000;
  const recent = quotes.filter((q) => Date.parse(q.created_at) >= since);
  const withStatus = recent.map((q) => ({ q, s: effectiveQuoteStatus(q, now) }));

  // "Waiting" requests haven't had their chance yet; cancelled ones were
  // withdrawn by the customer — neither counts for or against the vendor.
  const decidable = withStatus.filter((x) => x.s !== "pending" && x.s !== "cancelled");
  const answered = decidable.filter((x) => x.s === "quoted" || x.s === "declined" || x.s === "accepted" || (x.s === "expired" && x.q.quoted_amount != null));

  const priced = withStatus.filter((x) => x.q.quoted_amount != null && x.s !== "quoted" && x.s !== "cancelled");
  const accepted = withStatus.filter((x) => x.s === "accepted");

  return {
    received: recent.length,
    matched: recent.filter((q) => q.origin === "smart_match").length,
    replyRate: decidable.length ? answered.length / decidable.length : null,
    conversionRate: priced.length ? accepted.length / priced.length : null,
    bookedValue: accepted.reduce((sum, x) => sum + Number(x.q.quoted_amount ?? 0), 0),
  };
}
