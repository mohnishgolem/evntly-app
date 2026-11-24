// Original 3D miniature illustrations for each live category (generated for
// Evntly, transparent WebP, 384px, same light and angle). Categories without
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
