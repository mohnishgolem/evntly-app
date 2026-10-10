"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { List, MapIcon } from "lucide-react";
import { VendorCard } from "@/components/vendor-card";
import { VendorMapLoader } from "@/components/vendor-map-loader";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type Vendor = Database["public"]["Tables"]["service_providers"]["Row"];

export function ExploreResults({
  vendors,
  savedVendorIds = [],
  isAuthenticated = false,
}: {
  vendors: Vendor[];
  savedVendorIds?: string[];
  isAuthenticated?: boolean;
}) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<"list" | "map">(
    searchParams.get("view") === "map" ? "map" : "list"
  );

  if (vendors.length === 0) {
    return (
      <div className="mt-12 rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="text-lg font-semibold">No vendors match those filters</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Try a different category or clear your search.
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
