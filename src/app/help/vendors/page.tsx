import type { Metadata } from "next";
import { getPaymentsStatus } from "@/lib/payments/server";
import { VENDOR_GUIDE, helpArticles } from "@/lib/help/content";
import { GuideView } from "@/components/help/guide-view";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Vendor guide",
  description: "How to run your event business on Evntly: your listing, leads and quotes, confirming bookings, the job card and getting paid.",
  path: "/help/vendors",
});

export default async function VendorGuidePage() {
  const { enabled } = await getPaymentsStatus();
  return (
    <GuideView
      title="Running your business on Evntly"
      intro="Setting up your listing, winning work and delivering bookings — how everything works for vendors."
      sections={VENDOR_GUIDE}
      articles={helpArticles({ paymentsEnabled: enabled })}
      otherGuide={{ href: "/help/customers", label: "Read the customer guide →" }}
    />
  );
}
