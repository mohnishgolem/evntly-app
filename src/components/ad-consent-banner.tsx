"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { AD_CONSENT_EVENT, adConsentChoice, metaPixelConfigured, setAdConsent } from "@/lib/meta-pixel";

// Asks once whether Evntly may use Meta's measurement tools (Pixel and
// Conversions API) to see which of its Facebook/Instagram ads bring vendors.
// Nothing Meta-related loads or is sent until "Allow". Shown only when the
// pixel is switched on for this deploy; never shown to DNT/GPC browsers.
export function AdConsentBanner() {
  const choice = useSyncExternalStore(subscribe, () => adConsentChoice() ?? "ask", () => "server");
  const show = metaPixelConfigured() && choice === "ask";
  const ref = useRef<HTMLDivElement>(null);

  // While the card is up, everything that floats above the phone tab bar
  // (Request quote / Claim bars, the Map button, the page-end spacer) moves up
  // by its height via --consent-h, so the card never hides an action.
  useEffect(() => {
    const el = ref.current;
    if (!show || !el) return;
    const root = document.documentElement;
    const phone = window.matchMedia("(max-width: 767px)");
    const update = () => root.style.setProperty("--consent-h", phone.matches ? `${el.offsetHeight + 8}px` : "0px");
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    phone.addEventListener("change", update);
    return () => {
      ro.disconnect();
      phone.removeEventListener("change", update);
      root.style.removeProperty("--consent-h");
    };
  }, [show]);

  if (!show) return null;
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Ad measurement choice"
      // Phones: a floating card just above the tab bar, never over the header
      // or navigation; bars above the tab bar make room for it (--consent-h).
      // Desktop: a bar along the bottom.
      className="frost fixed inset-x-3 bottom-[calc(var(--tabbar-height)+0.5rem)] z-50 rounded-2xl border border-border px-4 py-3 shadow-[var(--shadow-float)] [--frost-bg:color-mix(in_oklab,var(--background)_95%,transparent)] [--frost-blur:8px] md:inset-x-0 md:bottom-0 md:rounded-none md:border-x-0 md:border-b-0 md:pb-[calc(env(safe-area-inset-bottom,0px)+12px)] md:shadow-lg"
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
