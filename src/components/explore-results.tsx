"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { List, MapIcon } from "lucide-react";
import { VendorCard } from "@/components/vendor-card";
import { VendorMapLoader } from "@/components/vendor-map-loader";
import { cn } from "@/lib/utils";
import type { PublicVendor } from "@/lib/vendor-columns";

type Vendor = PublicVendor;

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
  const searchParams = useSearchParams();
  const [view, setView] = useState<"list" | "map">(
    searchParams.get("view") === "map" ? "map" : "list"
  );

  if (vendors.length === 0 && fallback.length > 0) {
    return (
      <div className="mt-6">
        <div className="mb-5 rounded-2xl border border-border bg-muted/40 p-4">
          <p className="font-semibold">No vendors list “{searchParams.get("q")}” yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Most vendors travel across Sydney — check their service area, or{" "}
            <Link href="/plan" className="font-medium text-foreground underline underline-offset-2">
              post your event
            </Link>{" "}
            and let vendors come to you.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {fallback.map((v) => (
            <VendorCard
              key={v.id}
              vendor={v}
              saved={savedVendorIds.includes(v.id)}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <div className="mt-12 rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="text-lg font-semibold">No vendors match those filters</p>
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
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {vendors.length} vendor{vendors.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-1 rounded-full border border-border p-1">
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              view === "list" ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            onClick={() => setView("map")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              view === "map" ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            <MapIcon className="h-3.5 w-3.5" /> Map
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {vendors.map((v) => (
            <VendorCard
              key={v.id}
              vendor={v}
              saved={savedVendorIds.includes(v.id)}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
      ) : (
        <div className="h-[72vh] min-h-[480px] overflow-hidden rounded-3xl border border-border shadow-[0_4px_20px_rgba(15,23,42,0.06)]">
          <VendorMapLoader vendors={vendors} />
        </div>
      )}
    </div>
  );
}
