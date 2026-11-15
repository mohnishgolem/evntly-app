"use client";

import { metaPixelConfigured, resetAdConsent } from "@/lib/meta-pixel";

// Footer link to change the ad-measurement choice: withdraws consent (stops
// the pixel, deletes Meta's cookies) and shows the banner again.
export function AdChoicesLink({ className }: { className?: string }) {
  if (!metaPixelConfigured()) return null;
  return (
    <button type="button" onClick={resetAdConsent} className={className}>
      Ad choices
    </button>
  );
}
