"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicVendor } from "@/lib/vendor-columns";
import { onFirstEngagement } from "@/lib/user-engaged";

type Vendor = PublicVendor;

// MapLibre needs WebGL + `window`, so it only loads on the client.
const VendorMap = dynamic(
  () => import("@/components/vendor-map").then((m) => m.VendorMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> }
);

/**
 * deferUntilVisible: don't download or start MapLibre until the visitor has
 * started using the page (first scroll, tap, key or mouse movement) AND the
 * map is about to scroll into view. On the home page it was most of the
 * page's main-thread blocking time at load (PageSpeed mobile, 18 Nov 2026:
 * TBT 1,120–1,700 ms). Visibility alone wasn't enough: on phones the map
 * starts just below the hero, inside the first screen plus margin.
 */
export function VendorMapLoader({
  vendors,
  embedded = false,
  deferUntilVisible = false,
}: {
  vendors: Vendor[];
  embedded?: boolean;
  deferUntilVisible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [engaged, setEngaged] = useState(!deferUntilVisible);
  const [show, setShow] = useState(!deferUntilVisible);

  useEffect(() => {
    if (engaged) return;
    return onFirstEngagement(window, () => setEngaged(true));
  }, [engaged]);

  useEffect(() => {
    if (show || !engaged) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [show, engaged]);

  if (show) return <VendorMap vendors={vendors} embedded={embedded} />;
  return (
    <div ref={ref} className="h-full w-full">
      <Skeleton className="h-full w-full rounded-none" />
    </div>
  );
}
