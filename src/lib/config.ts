import {
  Music,
  Camera,
  Flower2,
  UtensilsCrossed,
  Video,
  Palette,
  Mic,
  Sparkles,
  ClipboardList,
  PartyPopper,
  HeartHandshake,
  Landmark,
  type LucideIcon,
} from "lucide-react";

// Order is display order (filter chips, plan/signup pickers): the Ecosystem
// Strategy's focus categories first, then the rest.
export const VENDOR_CATEGORIES = [
  { value: "photographer", label: "Photographer", icon: Camera },
  { value: "decorator", label: "Decorator", icon: Palette },
  { value: "dj", label: "DJ", icon: Music },
  { value: "celebrant", label: "Celebrant", icon: HeartHandshake },
  { value: "venue", label: "Venue", icon: Landmark },
  { value: "florist", label: "Florist", icon: Flower2 },
  { value: "caterer", label: "Caterer", icon: UtensilsCrossed },
  { value: "videographer", label: "Videographer", icon: Video },
  { value: "mc", label: "MC", icon: Mic },
  { value: "makeup_artist", label: "Makeup Artist", icon: Sparkles },
  { value: "event_planner", label: "Event Planner", icon: ClipboardList },
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]["value"];

// Categories hidden from browse, plan and signup for now. Venues need
// per-event pricing (listings are priced per hour) before they launch.
export const HIDDEN_CATEGORIES: VendorCategory[] = ["venue"];

// Categories live in the launch market: browse, plan and signup.
export const LAUNCH_CATEGORIES: VendorCategory[] = VENDOR_CATEGORIES.map((c) => c.value).filter(
  (c) => !HIDDEN_CATEGORIES.includes(c)
);

// The Ecosystem Strategy's focus categories (Sydney photographers,
// decorators, DJs, celebrants and small venues), named in marketing copy.
// Venue returns here when it's unhidden.
export const FEATURED_CATEGORIES: VendorCategory[] = ["photographer", "decorator", "dj", "celebrant"];

export function isVendorCategory(value: string): value is VendorCategory {
  return VENDOR_CATEGORIES.some((c) => c.value === value);
}

export function isLaunchCategory(value: string): value is VendorCategory {
  return (LAUNCH_CATEGORIES as string[]).includes(value);
}

export const LAUNCH_CITY = "Sydney";

// Browser chrome / installed-app colours: the app's dark and light page
// backgrounds (globals.css --background). The app icon itself is
// public/icons/* and public/apple-touch-icon.png — the white wordmark on black.
export const THEME_COLOR_DARK = "#101014";
export const THEME_COLOR_LIGHT = "#ffffff";

// Canonical production origin — used for metadataBase, sitemap/robots URLs,
// and anywhere an absolute link is required (OG tags, share links).
export const SITE_URL = "https://evntlyapp.com";

// The original Vercel address. It still serves the site, and auth emails
// requested from it must link back to it (the PKCE sign-in cookie belongs
// to the address the person started on).
export const LEGACY_SITE_URL = "https://evntly-tau.vercel.app";

// events.guest_count is one of these labels (the plan wizard's buckets).
export const GUEST_BUCKETS = ["Under 80", "80 – 150", "Over 150"] as const;

export const EVENT_TYPES = [
  "Wedding",
  "Birthday",
  "Corporate",
  "Engagement",
  "Cultural",
  "Party",
] as const;

// Shared between the (client) explore filters UI and the (server) explore
// page's query building — a "use client" module's non-component exports
// aren't usable from server code, so this can't live in explore-filters.tsx.
export const PRICE_BUCKETS: {
  value: string;
  label: string;
  min?: number;
  max?: number;
}[] = [
  { value: "under-50", label: "Under $50/hr", max: 50 },
  { value: "50-100", label: "$50–100/hr", min: 50, max: 100 },
  { value: "100-200", label: "$100–200/hr", min: 100, max: 200 },
  { value: "200-plus", label: "$200+/hr", min: 200 },
];

export function categoryLabel(value: string) {
  return VENDOR_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** "DJs", "photographers": for running text. */
export function categoryPlural(value: string) {
  return value === "dj" ? "DJs" : `${categoryLabel(value).toLowerCase()}s`;
}

export function categoryIcon(value: string): LucideIcon {
  return VENDOR_CATEGORIES.find((c) => c.value === value)?.icon ?? PartyPopper;
}

// One accent color per category, used for map marker outlines/dots.
const CATEGORY_COLORS: Record<string, string> = {
  dj: "#6d3ee0",
  photographer: "#4a7df0",
  florist: "#e0559a",
  caterer: "#e8a53a",
  videographer: "#0891b2",
  decorator: "#d946ef",
  mc: "#e8a53a",
  makeup_artist: "#e11d48",
  event_planner: "#16a34a",
  celebrant: "#ea580c",
  venue: "#0d9488",
};

export function categoryColor(value: string) {
  return CATEGORY_COLORS[value] ?? "#e8604a";
}

// Legal document versions live in src/lib/legal/versions.ts.
