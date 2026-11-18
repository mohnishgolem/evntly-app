import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { vendorAgreement } from "@/lib/legal/documents/vendor-agreement";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: vendorAgreement.title,
  description: vendorAgreement.summary,
  path: vendorAgreement.path,
});

export default function Page() {
  return <LegalDocumentView doc={vendorAgreement} />;
}
