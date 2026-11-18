import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { cancellationPolicy } from "@/lib/legal/documents/cancellation-policy";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: cancellationPolicy.title,
  description: cancellationPolicy.summary,
  path: cancellationPolicy.path,
});

export default function Page() {
  return <LegalDocumentView doc={cancellationPolicy} />;
}
