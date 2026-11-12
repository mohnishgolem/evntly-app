"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackFunnelEvent } from "@/lib/track-client";

// A "Claim" link on /founding-vendors that also counts the click for the
// founding funnel (anonymous; see trackFunnelEvent).
export function ClaimLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={className} onClick={() => trackFunnelEvent("claim_click")}>
      {children}
    </Link>
  );
}
