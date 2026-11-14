"use client";

import { useEffect } from "react";
import { trackFunnelEvent } from "@/lib/track-client";

// Counts one founding funnel step when the page opens (anonymous; see
// trackFunnelEvent). Used for the vendor sign-up form, which has no page view
// kind of its own because /signup serves customers too.
export function FunnelPing({ event }: { event: "signup_view" }) {
  useEffect(() => trackFunnelEvent(event), [event]);
  return null;
}
