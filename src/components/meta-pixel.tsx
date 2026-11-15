"use client";

import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import { AD_CONSENT_EVENT, hasMarketingConsent, META_PIXEL_ID, metaPixelConfigured, metaPixelTrack, takeRegistrationEventId } from "@/lib/meta-pixel";

// Loads the Meta Pixel only when every lock in lib/meta-pixel.ts is open,
// including this visitor's "Allow" on the ad-measurement banner.
export function MetaPixel({ nonce }: { nonce?: string }) {
  const consented = useSyncExternalStore(subscribe, hasMarketingConsent, () => false);
  if (!metaPixelConfigured() || !consented) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive" nonce={nonce}>
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <RegistrationPixel />
    </>
  );
}

// After a vendor confirms their email, the server leaves the event id it sent
// to the Conversions API; the browser fires the same event with the same id
// so Meta counts one registration, not two.
function RegistrationPixel() {
  useEffect(() => {
    // The pixel script loads after hydration; wait (up to 5s) for fbq. The id
    // cookie is read (and deleted) only at the moment the event fires, so it
    // fires at most once even if this effect runs twice.
    let tries = 0;
    const timer = window.setInterval(() => {
      const ready = typeof (window as unknown as { fbq?: unknown }).fbq === "function";
      if (!ready && ++tries <= 50) return;
      window.clearInterval(timer);
      if (!ready) return;
      const id = takeRegistrationEventId();
      if (id) metaPixelTrack("CompleteRegistration", id);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}

function subscribe(onChange: () => void) {
  window.addEventListener(AD_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(AD_CONSENT_EVENT, onChange);
}
