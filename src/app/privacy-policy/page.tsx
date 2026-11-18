import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { privacyPolicy } from "@/lib/legal/documents/privacy-policy";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: privacyPolicy.title,
  description: privacyPolicy.summary,
  path: privacyPolicy.path,
});

export default function Page() {
  return <LegalDocumentView doc={privacyPolicy} />;
}
