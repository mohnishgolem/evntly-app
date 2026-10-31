"use client";

import { useEffect } from "react";
import { SOURCE_COOKIE, type FoundingSource } from "@/lib/founding/sources";

// Remembers which link brought the visitor (Instagram bio, a DM, the
// waitlist email…) for 30 days, so the source survives signing up and
// confirming their email. Holds only the source name — no identifiers.
export function SourceCookie({ source }: { source: FoundingSource | null }) {
  useEffect(() => {
    if (!source) return;
    document.cookie = `${SOURCE_COOKIE}=${source}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [source]);
  return null;
}
