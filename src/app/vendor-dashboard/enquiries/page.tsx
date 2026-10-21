import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { getVendorQuotes } from "@/lib/data/vendor-quotes";
import { VendorQuoteCards } from "@/components/vendor-quote-cards";
import { DashboardNav } from "@/components/dashboard-nav";

export const metadata: Metadata = {
  title: "Enquiries",
  robots: { index: false, follow: false },
};

export default async function VendorEnquiriesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard/enquiries");

  const { enquiries } = await getVendorQuotes();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Enquiries</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Customers asking for a price. Reply before the request expires.
      </p>

      <DashboardNav tabs="vendorEnquiryTabs" label="Enquiry types" />

      {enquiries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You&apos;re all caught up. New quote requests will appear here.
        </p>
      ) : (
        <VendorQuoteCards quotes={enquiries} />
      )}
    </div>
  );
}
