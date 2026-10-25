import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { cancellationPolicy } from "@/lib/legal/documents/cancellation-policy";

export const metadata: Metadata = {
  title: cancellationPolicy.title,
  description: cancellationPolicy.summary,
  alternates: { canonical: cancellationPolicy.path },
};

export default function Page() {
  return <LegalDocumentView doc={cancellationPolicy} />;
}
