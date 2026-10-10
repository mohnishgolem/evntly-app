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
  type LucideIcon,
} from "lucide-react";

export const VENDOR_CATEGORIES = [
  { value: "dj", label: "DJ", icon: Music },
  { value: "photographer", label: "Photographer", icon: Camera },
  { value: "florist", label: "Florist", icon: Flower2 },
  { value: "caterer", label: "Caterer", icon: UtensilsCrossed },
  { value: "videographer", label: "Videographer", icon: Video },
  { value: "decorator", label: "Decorator", icon: Palette },
  { value: "mc", label: "MC", icon: Mic },
  { value: "makeup_artist", label: "Makeup Artist", icon: Sparkles },
  { value: "event_planner", label: "Event Planner", icon: ClipboardList },
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]["value"];

// Categories live in the launch market. Everything else in VENDOR_CATEGORIES
// exists in the schema but is hidden from browse/signup until launch expands.
export const LAUNCH_CATEGORIES: VendorCategory[] = [
  "dj",
  "photographer",
  "florist",
  "caterer",
];

export const LAUNCH_CITY = "Sydney";

// Canonical production origin — used for metadataBase, sitemap/robots URLs,
// and anywhere an absolute link is required (OG tags, share links). Update
// this if/when a custom domain is attached to the Vercel project.
export const SITE_URL = "https://evntly-tau.vercel.app";

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
  decorator: "#e0559a",
  mc: "#e8a53a",
  makeup_artist: "#e11d48",
  event_planner: "#16a34a",
};

export function categoryColor(value: string) {
  return CATEGORY_COLORS[value] ?? "#e8604a";
}
