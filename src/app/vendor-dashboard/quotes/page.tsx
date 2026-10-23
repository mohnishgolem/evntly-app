import type { Metadata } from "next";
import Link from "next/link";
import { requireVendor } from "@/lib/data/user";
import { getVendorQuotes } from "@/lib/data/vendor-quotes";
import { getMyConversationIds } from "@/lib/data/conversations";
import { VendorQuoteCards } from "@/components/vendor-quote-cards";
import { DashboardNav } from "@/components/dashboard-nav";
import { effectiveQuoteStatus } from "@/lib/quote-expiry";

export const metadata: Metadata = {
  title: "Quotes",
  robots: { index: false, follow: false },
};

// Quotes live inside Leads: sent prices waiting on the customer first, then
// how the rest ended up (accepted, declined, expired).
export default async function VendorQuotesPage() {
  await requireVendor("/vendor-dashboard/quotes");

  const [{ quotes, enquiries }, conversationIds] = await Promise.all([getVendorQuotes(), getMyConversationIds()]);
  const open = quotes.filter((q) => effectiveQuoteStatus(q) === "quoted");
  const closed = quotes.filter((q) => effectiveQuoteStatus(q) !== "quoted");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Leads</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Prices you&apos;ve sent, and how each request ended up.
      </p>

      <DashboardNav tabs="vendorLeadsTabs" label="Lead types" />

      {enquiries.length > 0 && (
        <Link
          href="/vendor-dashboard/enquiries"
          className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
        >
          <span>
            <span className="font-semibold">
              {enquiries.length} new {enquiries.length === 1 ? "request" : "requests"}
            </span>{" "}
            waiting for your price.
          </span>
          <span className="font-medium underline underline-offset-2">Reply</span>
        </Link>
      )}

      {quotes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No quotes yet. When you reply to a request with a price, it moves here.
        </p>
      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <section aria-labelledby="open-quotes">
              <h2 id="open-quotes" className="mb-3 text-sm font-semibold text-muted-foreground">
                Waiting on the customer ({open.length})
              </h2>
              <VendorQuoteCards quotes={open} conversationIds={conversationIds} />
            </section>
          )}
          {closed.length > 0 && (
            <section aria-labelledby="closed-quotes">
              <h2 id="closed-quotes" className="mb-3 text-sm font-semibold text-muted-foreground">
                Accepted, declined or expired ({closed.length})
              </h2>
              <VendorQuoteCards quotes={closed} conversationIds={conversationIds} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
