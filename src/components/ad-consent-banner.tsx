"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { AD_CONSENT_EVENT, adConsentChoice, metaPixelConfigured, setAdConsent } from "@/lib/meta-pixel";

// Asks once whether Evntly may use Meta's measurement tools (Pixel and
// Conversions API) to see which of its Facebook/Instagram ads bring vendors.
// Nothing Meta-related loads or is sent until "Allow". Shown only when the
// pixel is switched on for this deploy; never shown to DNT/GPC browsers.
export function AdConsentBanner() {
  const choice = useSyncExternalStore(subscribe, () => adConsentChoice() ?? "ask", () => "server");
  if (!metaPixelConfigured() || choice !== "ask") return null;
  return (
    <div
      role="region"
      aria-label="Ad measurement choice"
      // Phones: at the top, so the sticky "Claim my free listing" bar and the
      // tab bar at the bottom stay visible and tappable. Desktop: bottom.
      className="frost fixed inset-x-0 top-0 z-50 border-b border-border px-4 pb-2.5 pt-[calc(env(safe-area-inset-top,0px)+10px)] shadow-lg [--frost-bg:color-mix(in_oklab,var(--background)_95%,transparent)] [--frost-blur:8px] sm:top-auto sm:bottom-0 sm:border-b-0 sm:border-t sm:pb-[calc(env(safe-area-inset-bottom,0px)+12px)] sm:pt-3"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground sm:text-sm sm:leading-relaxed">
          Allow Meta to measure which of our ads bring vendors? It sets Meta cookies and tells Meta when you sign up as a
          vendor. Never your name, email or phone.{" "}
          <Link href="/privacy-policy#cookies" className="font-medium text-foreground underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
        <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdConsent("denied")}>
            No thanks
          </Button>
          <Button size="sm" onClick={() => setAdConsent("granted")}>
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener(AD_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(AD_CONSENT_EVENT, onChange);
}
