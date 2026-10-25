import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { vendorAgreement } from "@/lib/legal/documents/vendor-agreement";

export const metadata: Metadata = {
  title: vendorAgreement.title,
  description: vendorAgreement.summary,
  alternates: { canonical: vendorAgreement.path },
};

export default function Page() {
  return <LegalDocumentView doc={vendorAgreement} />;
}
