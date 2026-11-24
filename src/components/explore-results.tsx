"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { List, MapIcon } from "lucide-react";
import { VendorCard } from "@/components/vendor-card";
import { VendorMapLoader } from "@/components/vendor-map-loader";
import { cn } from "@/lib/utils";
import type { PublicVendor } from "@/lib/vendor-columns";

type Vendor = PublicVendor;

// No price sort on purpose: listings mix hourly, per-event and "from" prices,
// so "cheapest first" would compare different things.
export const SORTS = [
  { value: "", label: "Recommended" },
  { value: "rating", label: "Top rated" },
  { value: "reviews", label: "Most reviewed" },
] as const;
export type SortValue = (typeof SORTS)[number]["value"];

/** Orders vendors for display. "" keeps the server's recommended order. */
export function sortVendors<T extends Pick<Vendor, "rating" | "review_count">>(vendors: T[], sort: string): T[] {
  if (sort !== "rating" && sort !== "reviews") return vendors;
  const rating = (v: T) => (v.rating && v.rating > 0 ? v.rating : -1);
  const reviews = (v: T) => v.review_count ?? 0;
  return [...vendors].sort((a, b) =>
    sort === "rating" ? rating(b) - rating(a) || reviews(b) - reviews(a) : reviews(b) - reviews(a) || rating(b) - rating(a)
  );
}

const grid = "grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export function ExploreResults({
  vendors,
  fallback = [],
  savedVendorIds = [],
  isAuthenticated = false,
}: {
  vendors: Vendor[];
  fallback?: Vendor[];
  savedVendorIds?: string[];
  isAuthenticated?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"list" | "map">(searchParams.get("view") === "map" ? "map" : "list");
  const sort = searchParams.get("sort") ?? "";
  const sorted = useMemo(() => sortVendors(vendors, sort), [vendors, sort]);

  function setSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("sort", value);
    else params.delete("sort");
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  }

  if (vendors.length === 0 && fallback.length > 0) {
    return (
      <div className="mt-6">
        <div className="mb-6 rounded-3xl bg-secondary p-5">
          <p className="font-semibold">No vendors list “{searchParams.get("q")}” yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Most vendors travel across Sydney — check their service area, or{" "}
            <Link href="/plan" className="font-medium text-foreground underline underline-offset-2">
              post your event
            </Link>{" "}
            and let vendors come to you.
          </p>
        </div>
        <div className={grid}>
          {fallback.map((v) => (
            <VendorCard key={v.id} vendor={v} saved={savedVendorIds.includes(v.id)} isAuthenticated={isAuthenticated} />
          ))}
        </div>
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <div className="mt-10 rounded-3xl border border-dashed border-border px-6 py-16 text-center">
        <p className="text-headline">No vendors match those filters</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Try a different category or clear your search, or{" "}
          <Link href="/plan" className="font-medium text-foreground underline underline-offset-2">
            post your event
          </Link>{" "}
          so vendors can send you quotes.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          <span className="text-foreground tabular-nums">{vendors.length}</span> vendor{vendors.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-background pr-2 pl-4 text-sm">
            <span className="text-muted-foreground">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="cursor-pointer appearance-none bg-transparent pr-1 font-semibold outline-none"
              aria-label="Sort vendors"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {/* Desktop toggle; phones get the floating button below. */}
          <div className="hidden items-center rounded-full border border-border p-1 md:flex" role="group" aria-label="View">
            <ViewButton active={view === "list"} onClick={() => setView("list")} icon={List} label="List" />
            <ViewButton active={view === "map"} onClick={() => setView("map")} icon={MapIcon} label="Map" />
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className={grid}>
          {sorted.map((v, i) => (
            <VendorCard key={v.id} vendor={v} saved={savedVendorIds.includes(v.id)} isAuthenticated={isAuthenticated} priority={i < 4} />
          ))}
        </div>
      ) : (
        <div className="h-[calc(100dvh-15rem)] min-h-[440px] overflow-hidden rounded-[1.75rem] border border-border shadow-card">
          <VendorMapLoader vendors={sorted} />
        </div>
      )}

      {/* Phones: a floating Map / List switch above the tab bar, as in native apps. */}
      <button
        type="button"
        onClick={() => setView(view === "list" ? "map" : "list")}
        className="press fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-background shadow-raised md:hidden print:hidden"
      >
        {view === "list" ? <MapIcon className="size-4" aria-hidden /> : <List className="size-4" aria-hidden />}
        {view === "list" ? "Map" : "List"}
      </button>
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" aria-hidden /> {label}
    </button>
  );
}
