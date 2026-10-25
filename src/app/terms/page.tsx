import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { customerTerms } from "@/lib/legal/documents/customer-terms";

export const metadata: Metadata = {
  title: customerTerms.title,
  description: customerTerms.summary,
  alternates: { canonical: customerTerms.path },
};

export default function Page() {
  return <LegalDocumentView doc={customerTerms} />;
}
