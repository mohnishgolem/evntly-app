"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageViewFor } from "@/lib/page-views";

// Counts visits to a few key pages for the admin funnel. The visitor id is a
// random value kept in this browser (no cookies, nothing personal); nothing
// is sent when Do Not Track or Global Privacy Control is on.
function visitorId() {
  try {
    let id = localStorage.getItem("evntly_vid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("evntly_vid", id);
    }
    return id;
  } catch {
    return null;
  }
}

export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const view = pageViewFor(pathname);
    if (!view) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    const id = visitorId();
    if (!id) return;
    const body = JSON.stringify({ kind: view.kind, vendorId: view.vendorId, visitorId: id });
    try {
      if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
        void fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
      }
    } catch {
      // Analytics must never break the page.
    }
  }, [pathname]);

  return null;
}
