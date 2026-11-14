"use client";

import { useEffect } from "react";
import { foundingCookieWrites, type FoundingSource } from "@/lib/founding/sources";

// Remembers which link brought the visitor (Instagram bio, a DM, the
// waitlist email, a founding vendor's referral link) for 30 days, so it
// survives signing up and confirming their email. Holds only the source
// name, the post's campaign tag (e.g. reel-a-1117) and, for referrals, the
// referrer's public code. A new link without a campaign tag clears the old
// tag (see foundingCookieWrites).
export function SourceCookie({
  source,
  referral = null,
  campaign = null,
}: {
  source: FoundingSource | null;
  referral?: string | null;
  campaign?: string | null;
}) {
  useEffect(() => {
    for (const cookie of foundingCookieWrites({ source, referral, campaign }, location.protocol === "https:")) document.cookie = cookie;
  }, [source, referral, campaign]);
  return null;
}
