"use client";

import { useEffect } from "react";
import { REF_COOKIE, SOURCE_COOKIE, type FoundingSource } from "@/lib/founding/sources";

// Remembers which link brought the visitor (Instagram bio, a DM, the
// waitlist email, a founding vendor's referral link) for 30 days, so it
// survives signing up and confirming their email. Holds only the source
// name and, for referrals, the referrer's public code.
export function SourceCookie({ source, referral = null }: { source: FoundingSource | null; referral?: string | null }) {
  useEffect(() => {
    const opts = `; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    if (source) document.cookie = `${SOURCE_COOKIE}=${source}${opts}`;
    if (referral) document.cookie = `${REF_COOKIE}=${referral}${opts}`;
  }, [source, referral]);
  return null;
}
