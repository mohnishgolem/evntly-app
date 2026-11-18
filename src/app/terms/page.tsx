import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { customerTerms } from "@/lib/legal/documents/customer-terms";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: customerTerms.title,
  description: customerTerms.summary,
  path: customerTerms.path,
});

export default function Page() {
  return <LegalDocumentView doc={customerTerms} />;
}
