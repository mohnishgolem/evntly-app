"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { Database } from "@/lib/supabase/database.types";

type Vendor = Database["public"]["Tables"]["service_providers"]["Row"];

// MapLibre needs WebGL + `window`, so it only loads on the client.
const VendorMap = dynamic(
  () => import("@/components/vendor-map").then((m) => m.VendorMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> }
);

export function VendorMapLoader({
  vendors,
  embedded = false,
}: {
  vendors: Vendor[];
  embedded?: boolean;
}) {
  return <VendorMap vendors={vendors} embedded={embedded} />;
}
