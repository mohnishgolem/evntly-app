"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicVendor } from "@/lib/vendor-columns";

type Vendor = PublicVendor;

// MapLibre needs WebGL + `window`, so it only loads on the client.
const VendorMap = dynamic(
  () => import("@/components/vendor-map").then((m) => m.VendorMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> }
);

/**
 * deferUntilVisible: don't download or start MapLibre until the map is about
 * to scroll into view. On the home page the map sits below the fold, and
 * evaluating it at load was most of the page's main-thread blocking time
 * (PageSpeed mobile, 18 Nov 2026: TBT 1,120 ms).
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
  const [show, setShow] = useState(!deferUntilVisible);

  useEffect(() => {
    if (show) return;
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
  }, [show]);

  if (show) return <VendorMap vendors={vendors} embedded={embedded} />;
  return (
    <div ref={ref} className="h-full w-full">
      <Skeleton className="h-full w-full rounded-none" />
    </div>
  );
}
