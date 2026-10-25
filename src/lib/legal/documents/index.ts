import type { LegalDocument, LegalDocumentKey } from "@/lib/legal/types";
import { customerTerms } from "@/lib/legal/documents/customer-terms";
import { privacyPolicy } from "@/lib/legal/documents/privacy-policy";
import { vendorAgreement } from "@/lib/legal/documents/vendor-agreement";
import { cancellationPolicy } from "@/lib/legal/documents/cancellation-policy";

// Public legal documents, in the order they're listed on /legal. The vendor
// fee schedule is Schedule 1 inside the Vendor Service Agreement page.
export const LEGAL_DOCUMENTS: LegalDocument[] = [customerTerms, privacyPolicy, cancellationPolicy, vendorAgreement];

export const LEGAL_DOCUMENT_BY_KEY: Record<Exclude<LegalDocumentKey, "vendor_fee_schedule">, LegalDocument> = {
  customer_terms: customerTerms,
  privacy_policy: privacyPolicy,
  cancellation_policy: cancellationPolicy,
  vendor_agreement: vendorAgreement,
};
