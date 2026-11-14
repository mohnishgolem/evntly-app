"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageViewFor, sourceParamsFrom } from "@/lib/page-views";
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
    // Founding pages also send their own link tags (utm_*, src, ref), so the
    // landing view is credited to the link that brought the visitor even
    // before <SourceCookie> has stored it.
    const params = view.kind === "founding" || view.kind === "founding_claim" ? sourceParamsFrom(window.location.search) : undefined;
    sendTrack({ kind: view.kind, vendorId: view.vendorId, visitorId: id, ...(params ? { params } : {}) });
  }, [pathname]);

  return null;
}
