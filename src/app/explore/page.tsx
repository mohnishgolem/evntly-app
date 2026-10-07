import type { Metadata } from "next";
import { searchVendors } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { PRICE_BUCKETS, categoryLabel, LAUNCH_CITY } from "@/lib/config";
import { ExploreFilters } from "@/components/explore-filters";
import { ExploreResults } from "@/components/explore-results";

function parsePriceBucket(price?: string): [number | undefined, number | undefined] {
  const bucket = PRICE_BUCKETS.find((b) => b.value === price);
  return bucket ? [bucket.min, bucket.max] : [undefined, undefined];
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}): Promise<Metadata> {
  const { category, q } = await searchParams;
  if (q) {
    return {
      title: `"${q}" — Search results`,
      description: `Vendors matching "${q}" in ${LAUNCH_CITY}.`,
    };
  }
  if (category) {
    const label = categoryLabel(category);
    return {
      title: `${label} in ${LAUNCH_CITY}`,
      description: `Browse trusted ${label.toLowerCase()} for your event in ${LAUNCH_CITY}.`,
    };
  }
  return {
    title: "Explore vendors",
    description: `Browse every approved event vendor on Evntly in ${LAUNCH_CITY} — no account needed.`,
  };
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Explore vendors</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Browse every approved vendor on Evntly — no account needed.
      </p>

      <ExploreFilters />

      <ExploreResults
        vendors={vendors}
        savedVendorIds={session?.profile?.saved_providers ?? []}
        isAuthenticated={!!session}
      />
    </div>
  );
}
