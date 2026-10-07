import { searchVendors } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { ExploreFilters } from "@/components/explore-filters";
import { ExploreResults } from "@/components/explore-results";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; event?: string }>;
}) {
  const { q, category, event } = await searchParams;
  const [vendors, session] = await Promise.all([
    searchVendors({ q, category, eventType: event }),
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
