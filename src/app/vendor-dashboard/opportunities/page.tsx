import type { Metadata } from "next";
import Link from "next/link";
import { requireVendor } from "@/lib/data/user";
import { getVendorQuotes } from "@/lib/data/vendor-quotes";
import { VendorQuoteCards } from "@/components/vendor-quote-cards";
import { DashboardNav } from "@/components/dashboard-nav";
import { opportunityStats, STATS_WINDOW_DAYS } from "@/lib/matching/opportunities";

export const metadata: Metadata = {
  title: "Smart Opportunities",
  robots: { index: false, follow: false },
};

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

// Requests from customers who picked this vendor out of their matches, plus
// how the vendor is converting. Customers' contact details stay hidden (the
// cards read through my_quote_requests, which masks them).
export default async function SmartOpportunitiesPage() {
  await requireVendor("/vendor-dashboard/opportunities");
  const { enquiries, quotes } = await getVendorQuotes();
  const all = [...enquiries, ...quotes];
  const stats = opportunityStats(all);
  const waiting = enquiries.filter((q) => q.origin === "smart_match");
  const answered = quotes.filter((q) => q.origin === "smart_match").slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Smart Opportunities</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Customers whose event fits your area, prices and calendar, and who chose you from their matches.
      </p>

      <DashboardNav tabs="vendorEnquiryTabs" label="Enquiry types" />

      <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Matched requests", String(stats.matched)],
          ["Reply rate", pct(stats.replyRate)],
          ["Quotes booked", pct(stats.conversionRate)],
          ["Booked value", `$${stats.bookedValue.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="-mt-6 mb-8 text-xs text-muted-foreground">
        Last {STATS_WINDOW_DAYS} days, all quote requests ({stats.received}). Requests still waiting and ones customers
        cancel don&apos;t count against you.{" "}
        <Link href="/dashboard/settings/notifications" className="font-medium text-foreground underline underline-offset-2">
          Notification settings
        </Link>
      </p>

      <h2 className="mb-3 font-semibold">Waiting for your quote</h2>
      {waiting.length === 0 ? (
        <div className="mb-8 rounded-2xl bg-muted/60 p-5 text-sm text-muted-foreground">
          <p>No matched requests right now.</p>
          <p className="mt-2">
            You&apos;re matched more often with a current calendar and clear prices.{" "}
            <Link href="/vendor-dashboard/pricing" className="font-medium text-foreground underline underline-offset-2">
              Service & pricing
            </Link>{" "}
            ·{" "}
            <Link href="/vendor-dashboard/calendar" className="font-medium text-foreground underline underline-offset-2">
              Calendar
            </Link>
          </p>
        </div>
      ) : (
        <div className="mb-8">
          <VendorQuoteCards quotes={waiting} />
        </div>
      )}

      {answered.length > 0 && (
        <>
          <h2 className="mb-3 font-semibold">Recent matched requests</h2>
          <VendorQuoteCards quotes={answered} />
        </>
      )}
    </div>
  );
}
