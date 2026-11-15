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
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm leading-relaxed text-muted-foreground sm:flex-1">
          Can we use Meta&apos;s measurement tools to see which of our Facebook and Instagram ads bring vendors to Evntly? It
          sets Meta cookies and tells Meta when you sign up as a vendor. We never send your name, email or phone.{" "}
          <Link href="/privacy-policy#cookies" className="font-medium text-foreground underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
        <div className="flex gap-2">
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
