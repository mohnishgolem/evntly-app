"use client";

import { useEffect, useState } from "react";

// The hero clip is ~3MB. An autoplaying <video> starts downloading as soon
// as the HTML is parsed, competing with the page's own scripts and styles —
// on a phone's mobile data that noticeably delays the first paint. The
// poster image underneath is what people see first anyway, so the clip is
// only attached once the page has finished loading.
type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

export function prefersLightweightMedia(
  connection: NetworkInformationLike | undefined = (globalThis.navigator as { connection?: NetworkInformationLike } | undefined)
    ?.connection
) {
  if (!connection) return false;
  return connection.saveData === true || ["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "");
}

// On phones the hero is a short landscape band (~402x248 pt, ~1206x744 px
// on a 3x iPhone), so phones get the same 16:9 footage at 960x540, H.264
// ~0.9 Mbps (~1.7 MB): close to the band's real pixel size, so it stays
// sharp. The old 480x720 portrait crop had to be stretched ~2.5x and looked
// soft once the hero became landscape. Tablets and desktops get 1280x720.
export const PHONE_QUERY = "(max-width: 767px)";

export function pickHeroSrc(
  src: string,
  mobileSrc: string | undefined,
  matches: (query: string) => boolean = (q) => globalThis.matchMedia?.(q).matches ?? false
) {
  return mobileSrc && matches(PHONE_QUERY) ? mobileSrc : src;
}

export function HeroVideo({ src, mobileSrc, poster }: { src: string; mobileSrc?: string; poster: string }) {
  const [ready, setReady] = useState<string | null>(null);

  useEffect(() => {
    // Data Saver or a slow connection: keep the poster and skip the ~3MB clip.
    if (prefersLightweightMedia()) return;
    const start = () => setReady(pickHeroSrc(src, mobileSrc));
    if (document.readyState === "complete") {
      start();
      return;
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, [src, mobileSrc]);

  if (!ready) return null;
  return (
    <video
      src={ready}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      aria-hidden="true"
      className="hero-video absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
    />
  );
}
