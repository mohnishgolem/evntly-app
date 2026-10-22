// Dispute vocabulary shared by the booking page, admin queue and actions.
// The database checks the same values (booking_disputes constraints).

export const DISPUTE_REASONS = [
  { value: "no_show", label: "No-show", hint: "They didn't turn up, or turned up very late" },
  { value: "quality", label: "Quality", hint: "The service wasn't what was agreed" },
  { value: "cancellation", label: "Cancellation", hint: "A cancellation or refund disagreement" },
  { value: "payment", label: "Payment", hint: "Money owed, charged twice, or not received" },
  { value: "conduct", label: "Conduct", hint: "Unsafe, abusive or unprofessional behaviour" },
  { value: "other", label: "Something else", hint: "Anything that doesn't fit above" },
] as const;

export const DISPUTE_OUTCOMES = [
  { value: "customer_favour", label: "Resolved for the customer" },
  { value: "vendor_favour", label: "Resolved for the vendor" },
  { value: "partial", label: "Partly resolved for each" },
  { value: "mutual", label: "Settled between the parties" },
  { value: "no_action", label: "No action needed" },
] as const;

export type DisputeReason = (typeof DISPUTE_REASONS)[number]["value"];
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number]["value"];
export type DisputeStatus = "open" | "under_review" | "resolved" | "withdrawn";

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  open: "Open — waiting for Evntly",
  under_review: "Under review",
  resolved: "Resolved",
  withdrawn: "Withdrawn",
};

export const isDisputeReason = (v: unknown): v is DisputeReason => DISPUTE_REASONS.some((r) => r.value === v);
export const isDisputeOutcome = (v: unknown): v is DisputeOutcome => DISPUTE_OUTCOMES.some((o) => o.value === v);
export const reasonLabel = (v: string) => DISPUTE_REASONS.find((r) => r.value === v)?.label ?? v;
export const outcomeLabel = (v: string | null) => DISPUTE_OUTCOMES.find((o) => o.value === v)?.label ?? "";

/** Days a dispute has been waiting; the admin queue flags anything over 3. */
export function disputeAgeDays(createdAt: string, now = Date.now()) {
  return Math.floor((now - Date.parse(createdAt)) / 86_400_000);
}
export const DISPUTE_SLA_DAYS = 3;
