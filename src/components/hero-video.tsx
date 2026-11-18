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

export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Data Saver or a slow connection: keep the poster and skip the ~3MB clip.
    if (prefersLightweightMedia()) return;
    const start = () => setReady(true);
    if (document.readyState === "complete") {
      start();
      return;
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  if (!ready) return null;
  return (
    <video
      src={src}
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
