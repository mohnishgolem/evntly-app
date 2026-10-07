"use client";

import { useEffect, useRef } from "react";

export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Some strict in-app browsers (Instagram/TikTok webviews) only honor
    // the muted+autoplay policy if `muted` is set as a JS property after
    // mount — React doesn't reflect it into the server-rendered HTML, so
    // those webviews can see an "unmuted" video on first parse and refuse
    // to autoplay it.
    video.muted = true;
    video.play().catch(() => {});
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
    />
  );
}
