"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";
import { hasMarketingConsent, META_PIXEL_ID, metaPixelConfigured } from "@/lib/meta-pixel";

// Loads the Meta Pixel only when every lock in lib/meta-pixel.ts is open.
// Today it always renders nothing.
export function MetaPixel({ nonce }: { nonce?: string }) {
  // Read consent on the client only (false during server rendering).
  const consented = useSyncExternalStore(subscribe, hasMarketingConsent, () => false);
  if (!metaPixelConfigured() || !consented) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive" nonce={nonce}>
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
    </Script>
  );
}

// Consent is read once per page; a consent banner would re-render the page.
function subscribe() {
  return () => {};
}
