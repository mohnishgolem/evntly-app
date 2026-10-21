import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { getVendorQuotes } from "@/lib/data/vendor-quotes";
import { VendorQuoteCards } from "@/components/vendor-quote-cards";

export const metadata: Metadata = {
  title: "Quotes",
  robots: { index: false, follow: false },
};

export default async function VendorQuotesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard/quotes");

  const { quotes, enquiries } = await getVendorQuotes();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Quotes</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Prices you&apos;ve sent, and how each request ended up.
      </p>

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
        <p className="text-sm text-muted-foreground">
          No quotes yet. When you reply to an enquiry with a price, it moves here.
        </p>
      ) : (
        <VendorQuoteCards quotes={quotes} />
      )}
    </div>
  );
}
