// Original 3D miniature illustrations for each live category (generated for
// Evntly, transparent WebP, 256px, same light and angle). Categories without
// art fall back to their line icon.
const ART = new Set([
  "photographer",
  "videographer",
  "dj",
  "decorator",
  "celebrant",
  "florist",
  "caterer",
  "cakes_desserts",
  "mc",
  "makeup_artist",
  "event_planner",
]);

export function categoryArt(value: string): string | null {
  return ART.has(value) ? `/images/categories/${value}.webp` : null;
}

// Short labels for small category buttons on phones, where the full plural
// ("Cake and dessert makers") would wrap and make the whole row taller.
const SHORT_LABELS: Record<string, string> = {
  photographer: "Photo",
  videographer: "Video",
  dj: "DJs",
  decorator: "Decor",
  celebrant: "Celebrants",
  florist: "Florists",
  caterer: "Catering",
  cakes_desserts: "Cakes",
  mc: "MCs",
  makeup_artist: "Makeup",
  event_planner: "Planners",
};

export function categoryShortLabel(value: string, fallback: string): string {
  return SHORT_LABELS[value] ?? fallback;
}
