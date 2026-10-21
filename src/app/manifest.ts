import type { MetadataRoute } from "next";
import { LAUNCH_CITY, THEME_COLOR_DARK } from "@/lib/config";

// Makes Evntly installable ("Add to Home Screen" / Chrome's install prompt).
// No service worker: installability no longer requires one, and there's no
// offline mode to serve — every page needs live data.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Evntly — Find trusted event vendors",
    short_name: "Evntly",
    description: `Book photographers, decorators, DJs, celebrants and more for your event in ${LAUNCH_CITY}.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Splash screen: black to match the icon's background.
    background_color: "#000000",
    // Dark is the app's default theme, so the title bar matches first paint.
    theme_color: THEME_COLOR_DARK,
    categories: ["lifestyle", "shopping", "business"],
    icons: [
      // The wordmark sits within the centre ~66%, inside the maskable safe
      // zone (80% circle), so the same full-bleed image serves both purposes.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Explore vendors", url: "/explore" },
      { name: "Start planning", url: "/plan" },
      { name: "Messages", url: "/messages" },
    ],
  };
}
