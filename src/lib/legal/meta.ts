import type { LegalDocumentKey } from "@/lib/legal/types";

// Titles and paths only — safe to import from client components without
// pulling in the full document text.
export const LEGAL_DOCUMENT_TITLE: Record<LegalDocumentKey, string> = {
  customer_terms: "Terms & Conditions",
  privacy_policy: "Privacy Policy",
  cancellation_policy: "Cancellation, Refund & Dispute Policy",
  vendor_agreement: "Vendor Service Agreement",
  vendor_fee_schedule: "Vendor fee schedule",
};

const PATHS: Record<LegalDocumentKey, string> = {
  customer_terms: "/terms",
  privacy_policy: "/privacy-policy",
  cancellation_policy: "/cancellation-refund-dispute-policy",
  vendor_agreement: "/vendor-agreement",
  // The fee schedule is Schedule 1 of the Vendor Service Agreement.
  vendor_fee_schedule: "/vendor-agreement#schedule-1",
};

export function legalDocumentHref(key: LegalDocumentKey) {
  return PATHS[key];
}
