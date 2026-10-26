import type { Metadata } from "next";
import { requireVendor } from "@/lib/data/user";
import { getVendorQuotes } from "@/lib/data/vendor-quotes";
import { VendorQuoteCards } from "@/components/vendor-quote-cards";
import { DashboardNav } from "@/components/dashboard-nav";

export const metadata: Metadata = {
  title: "Leads",
  robots: { index: false, follow: false },
};

export default async function VendorEnquiriesPage() {
  await requireVendor("/vendor-dashboard/enquiries");

  const { enquiries } = await getVendorQuotes();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Leads</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Customers asking for a price. Reply before the request expires.
      </p>

      <DashboardNav tabs="vendorLeadsTabs" label="Lead types" />

      {enquiries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          You&apos;re all caught up. New quote requests will appear here.
        </p>
      ) : (
        <VendorQuoteCards quotes={enquiries} />
      )}
    </div>
  );
}
