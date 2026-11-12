"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageViewFor } from "@/lib/page-views";
import { analyticsVisitorId, sendTrack } from "@/lib/track-client";

// Counts visits to a few key pages for the admin funnel. The visitor id is a
// random value kept in this browser (no cookies, nothing personal); nothing
// is sent when Do Not Track or Global Privacy Control is on.
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const view = pageViewFor(pathname);
    if (!view) return;
    const id = analyticsVisitorId();
    if (!id) return;
    sendTrack({ kind: view.kind, vendorId: view.vendorId, visitorId: id });
  }, [pathname]);

  return null;
}
