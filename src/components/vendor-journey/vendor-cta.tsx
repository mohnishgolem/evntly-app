"use client";

import Link from "next/link";
import { trackVendorJourney } from "@/lib/track-client";

/** A link on the vendor landing page that records which button was used (hero, sticky, help…). */
export function VendorCta({ href, where, className, children }: { href: string; where: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={className} onClick={() => trackVendorJourney("vendor_cta", where)}>
      {children}
    </Link>
  );
}
