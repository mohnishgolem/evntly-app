import type { Metadata } from "next";
import { searchVendors } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { PRICE_BUCKETS } from "@/lib/config";
import { exploreMetadata } from "@/lib/seo";
import { ExploreFilters } from "@/components/explore-filters";
import { ExploreResults } from "@/components/explore-results";

function parsePriceBucket(price?: string): [number | undefined, number | undefined] {
  const bucket = PRICE_BUCKETS.find((b) => b.value === price);
  return bucket ? [bucket.min, bucket.max] : [undefined, undefined];
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; event?: string; price?: string }>;
}): Promise<Metadata> {
  return exploreMetadata(await searchParams);
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    event?: string;
    price?: string;
  }>;
}) {
  const { q, category, event, price } = await searchParams;
  const [minPrice, maxPrice] = parsePriceBucket(price);
  const [vendors, session] = await Promise.all([
    searchVendors({ q, category, eventType: event, minPrice, maxPrice }),
    getCurrentUser(),
  ]);
  // A place search with no match (e.g. "Parramatta" when nobody lists that
  // suburb) still shows vendors in the category — most travel across Sydney.
  const fallback =
    vendors.length === 0 && q
      ? (await searchVendors({ category, eventType: event, minPrice, maxPrice })).slice(0, 10)
      : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Explore vendors</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Browse every approved vendor on Evntly — no account needed.
      </p>

      <ExploreFilters />

      <ExploreResults
        vendors={vendors}
        fallback={fallback}
        savedVendorIds={session?.profile?.saved_providers ?? []}
        isAuthenticated={!!session}
      />
    </div>
  );
}
