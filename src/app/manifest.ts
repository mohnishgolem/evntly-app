import type { MetadataRoute } from "next";
import { LAUNCH_CITY } from "@/lib/config";
import { BRAND_BACKGROUND } from "@/lib/brand-icon";

// Makes Evntly installable ("Add to Home Screen" / Chrome's install prompt).
// No service worker: installability no longer requires one, and there's no
// offline mode to serve — every page needs live data.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Evntly — Find trusted event vendors",
    short_name: "Evntly",
    description: `Book DJs, photographers, florists and caterers for your event in ${LAUNCH_CITY}.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Dark is the app's default theme, so the splash screen matches first paint.
    background_color: BRAND_BACKGROUND,
    theme_color: BRAND_BACKGROUND,
    categories: ["lifestyle", "shopping", "business"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Explore vendors", url: "/explore" },
      { name: "Start planning", url: "/plan" },
      { name: "Messages", url: "/messages" },
    ],
  };
}
