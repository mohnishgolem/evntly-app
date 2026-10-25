// Current version of each legal document — the date it was last materially
// changed. Must match public.legal_document_versions in the database (see
// supabase/migrations/20261029090000_legal_consents.sql). To publish a new
// version: change the document, bump its date here, and add a migration that
// updates legal_document_versions. Everyone who must accept it is then asked
// again (see <LegalGate>), and the database refuses new quotes, messages,
// bookings and listings until they do.
export const LEGAL_VERSIONS = {
  customer_terms: "2026-10-24",
  privacy_policy: "2026-10-24",
  cancellation_policy: "2026-10-24",
  vendor_agreement: "2026-10-24",
  vendor_fee_schedule: "2026-10-24",
  // Version of the marketing-consent wording people agree to.
  marketing_emails: "2026-10-24",
} as const;

// These documents are drafts awaiting review by an Australian solicitor.
// While true, every legal page shows a "Draft" notice.
export const LEGAL_DRAFT = true;

export const LEGAL_ENTITY = "Sai Mohnish Golem trading as Evntly (ABN 49 193 658 959)";
export const LEGAL_CONTACT_EMAIL = "hello@evntlyapp.com";

export const MARKETING_CONSENT_LABEL =
  "Send me occasional emails about new features, tips and offers from Evntly. Optional — you can unsubscribe at any time.";

export type LegalVersionKey = keyof typeof LEGAL_VERSIONS;

export const USER_DOCUMENTS = ["customer_terms", "privacy_policy", "cancellation_policy"] as const;
export const VENDOR_DOCUMENTS = ["vendor_agreement", "vendor_fee_schedule"] as const;
