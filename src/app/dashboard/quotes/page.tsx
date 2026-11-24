import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { QuoteList } from "@/components/quote-list";
import { CategoryArt } from "@/components/category-art";
import { DashboardNav } from "@/components/dashboard-nav";
import { findSimilarVendors, type SimilarVendor } from "@/lib/data/vendors";
import { effectiveQuoteStatus } from "@/lib/quote-expiry";

export const metadata: Metadata = {
  title: "Requests & quotes",
  robots: { index: false, follow: false },
};


export default async function CustomerQuotesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/quotes");

  const supabase = await createClient();
  // Masked read: emails blanked, newest first (see my_quote_requests).
  const { data: quotes } = await supabase.rpc("my_quote_requests", { as_role: "client" });

  // Dead ends (vendor declined, or let the request expire) get three other
  // vendors in the same category, so the organiser has somewhere to go next.
  const deadEnds = (quotes ?? []).filter((q) => {
    const status = effectiveQuoteStatus(q);
    return (status === "declined" || (status === "expired" && q.quoted_amount == null)) && q.service_type;
  });
  const askedVendorIds = (quotes ?? []).map((q) => q.vendor_id).filter((id): id is string => !!id);
  const byCategory = new Map<string, SimilarVendor[]>();
  await Promise.all(
    [...new Set(deadEnds.map((q) => q.service_type!))].map(async (type) => {
      byCategory.set(type, await findSimilarVendors(supabase, type, askedVendorIds));
    })
  );
  const alternatives = Object.fromEntries(
    deadEnds.map((q) => [q.id, byCategory.get(q.service_type!) ?? []])
  );

  return (
    <div className="min-h-full bg-canvas">
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-title">Bookings</h1>
      <p className="mb-6 text-[15px] text-muted-foreground">
        Requests &amp; quotes: what you&apos;ve asked vendors for. Nothing here is booked until you
        accept a quote and the vendor confirms.
      </p>

      <DashboardNav tabs="customerBookingsTabs" label="Booking sections" />

      {!quotes || quotes.length === 0 ? (
        <div className="surface-raised flex flex-col items-center rounded-card px-6 py-12 text-center">
          <CategoryArt value="event_planner" className="size-20 drop-shadow-[0_6px_6px_rgba(28,25,23,0.16)]" />
          <p className="mt-3 font-semibold">No quote requests yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">Ask a vendor for a price from their profile. Requests and quotes appear here.</p>
          <Link href="/explore" className="btn-coral mt-5 inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold">
            Browse vendors
          </Link>
        </div>
      ) : (
        <QuoteList quotes={quotes} alternatives={alternatives} />
      )}
    </div>
    </div>
  );
}
