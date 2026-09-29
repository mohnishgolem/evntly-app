export const VENDOR_CATEGORIES = [
  { value: "dj", label: "DJ", icon: "🎵" },
  { value: "photographer", label: "Photographer", icon: "📷" },
  { value: "florist", label: "Florist", icon: "💐" },
  { value: "caterer", label: "Caterer", icon: "🍽️" },
  { value: "videographer", label: "Videographer", icon: "🎥" },
  { value: "decorator", label: "Decorator", icon: "🎨" },
  { value: "mc", label: "MC", icon: "🎤" },
  { value: "makeup_artist", label: "Makeup Artist", icon: "💄" },
  { value: "event_planner", label: "Event Planner", icon: "📋" },
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

export const EVENT_TYPES = [
  "Wedding",
  "Birthday",
  "Corporate",
  "Engagement",
  "Cultural",
  "Party",
] as const;

export function categoryLabel(value: string) {
  return VENDOR_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function categoryIcon(value: string) {
  return VENDOR_CATEGORIES.find((c) => c.value === value)?.icon ?? "🎉";
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
  return CATEGORY_COLORS[value] ?? "#dc5b52";
}
