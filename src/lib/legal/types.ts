// Legal documents are written once as data and rendered both as public pages
// (src/components/legal/legal-document.tsx) and as Markdown for review
// (scripts/export-legal-docs.ts).
//
// Inline text supports **bold**, [link text](/path) and [[TBC: …]] for facts
// the business still has to confirm (rendered as a highlighted placeholder).

export type LegalDocumentKey =
  | "customer_terms"
  | "privacy_policy"
  | "vendor_agreement"
  | "vendor_fee_schedule"
  | "cancellation_policy";

export type LegalBlock =
  | string
  | { list: string[] }
  | { note: string };

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  key: LegalDocumentKey;
  title: string;
  path: string;
  version: string;
  /** One-line plain-English summary shown under the title and on /legal. */
  summary: string;
  /** Short "key points" shown before the full text. */
  keyPoints?: string[];
  sections: LegalSection[];
};
