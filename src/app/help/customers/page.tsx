import type { Metadata } from "next";
import { getPaymentsStatus } from "@/lib/payments/server";
import { CUSTOMER_GUIDE, helpArticles } from "@/lib/help/content";
import { GuideView } from "@/components/help/guide-view";

export const metadata: Metadata = {
  title: "Customer guide",
  description: "How to plan an event on Evntly: finding vendors, requesting and accepting quotes, messaging, bookings, paying and cancelling.",
  alternates: { canonical: "/help/customers" },
};

export default async function CustomerGuidePage() {
  const { enabled } = await getPaymentsStatus();
  return (
    <GuideView
      title="Planning an event with Evntly"
      intro="From your first quote request to the day itself — how everything works for customers."
      sections={CUSTOMER_GUIDE}
      articles={helpArticles({ paymentsEnabled: enabled })}
      otherGuide={{ href: "/help/vendors", label: "Read the vendor guide →" }}
    />
  );
}
