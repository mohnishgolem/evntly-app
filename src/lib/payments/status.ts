// One customer-facing stage per milestone, derived from the three stored
// tracks (work / funding / payout). Matches the brief's workflow:
// Pending → In progress → Submitted → Customer review → Approved →
// Payment processing → Paid, plus Rejected, Disputed, Payment failed and
// Cancelled.

export type MilestoneTracks = {
  kind: string;
  work_status: string;
  funding_status: string;
  payout_status: string;
};

export type StageTone = "neutral" | "active" | "attention" | "success" | "danger";

export type Stage = { label: string; tone: StageTone; detail: string };

export function milestoneStage(m: MilestoneTracks, viewer: "vendor" | "customer" | "admin" = "customer"): Stage {
  const funded = m.funding_status === "funded";
  if (m.work_status === "cancelled" || m.funding_status === "refunded") {
    return { label: "Cancelled", tone: "neutral", detail: m.funding_status === "refunded" ? "Refunded to the customer." : "No longer part of this booking." };
  }
  if (m.payout_status === "paid") return { label: "Paid", tone: "success", detail: "Released to the vendor." };
  if (m.work_status === "disputed") return { label: "Disputed", tone: "danger", detail: "On hold while Evntly support reviews it." };
  if (m.funding_status === "failed") return { label: "Payment failed", tone: "danger", detail: "The card payment didn't go through." };
  if (m.payout_status === "processing") return { label: "Payment processing", tone: "active", detail: "Being released to the vendor." };
  if (m.payout_status === "failed") return { label: "Payment processing", tone: "attention", detail: "The payout is delayed — Evntly support is on it." };

  if (m.kind === "deposit") {
    return funded
      ? { label: "Deposit paid", tone: "active", detail: "Held by Evntly until the vendor confirms the booking." }
      : { label: "Pending", tone: "neutral", detail: "Paid by the customer to secure the booking." };
  }

  switch (m.work_status) {
    case "approved":
      return funded
        ? { label: "Approved", tone: "active", detail: "Approved — releasing to the vendor." }
        : { label: "Approved", tone: "attention", detail: "Approved — waiting for the customer's payment." };
    case "submitted":
      return {
        label: viewer === "vendor" ? "Submitted" : "Customer review",
        tone: "attention",
        detail: viewer === "vendor" ? "Waiting for the customer to approve." : "The vendor marked this done — please review.",
      };
    case "rejected":
      return { label: "Rejected", tone: "attention", detail: "The customer asked for changes." };
    case "in_progress":
      return { label: "In progress", tone: "active", detail: funded ? "Paid to Evntly and held." : "Work has started." };
    default:
      return { label: "Pending", tone: "neutral", detail: funded ? "Paid to Evntly and held." : "Not started." };
  }
}

export function fundingLabel(funding: string) {
  return (
    {
      unfunded: "Unpaid",
      processing: "Payment processing",
      funded: "Paid to Evntly",
      failed: "Payment failed",
      refunded: "Refunded",
      partially_refunded: "Partly refunded",
    }[funding] ?? funding
  );
}

const EVENT_COPY: Record<string, string> = {
  plan_proposed: "Vendor proposed the payment plan",
  plan_agreed: "Customer agreed to the payment plan",
  plan_changes_requested: "Customer asked for changes to the plan",
  plan_completed: "All payments released",
  checkout_started: "Customer opened the payment page",
  payment_received: "Payment received by Evntly",
  payment_failed: "Payment failed",
  work_in_progress: "Vendor started work",
  work_submitted: "Vendor marked it complete",
  work_approved: "Customer approved",
  work_rejected: "Customer asked for changes",
  disputed: "Dispute raised",
  chargeback_opened: "Card dispute opened with the bank",
  dispute_resolved_release: "Evntly resolved the dispute and released payment",
  payout_sent: "Released to the vendor",
  payout_failed: "Payout delayed",
  payout_reconciled: "Payout confirmed",
  payout_reversed: "Payout reversed",
  refunded: "Refunded to the customer",
  partially_refunded: "Partly refunded",
  refund_failed: "Refund attempt failed",
};

export function eventLabel(event: string) {
  return EVENT_COPY[event] ?? event.replace(/_/g, " ");
}
