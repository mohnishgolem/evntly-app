import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { privacyPolicy } from "@/lib/legal/documents/privacy-policy";

export const metadata: Metadata = {
  title: privacyPolicy.title,
  description: privacyPolicy.summary,
  alternates: { canonical: privacyPolicy.path },
};

export default function Page() {
  return <LegalDocumentView doc={privacyPolicy} />;
}
