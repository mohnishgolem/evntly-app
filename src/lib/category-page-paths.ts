// Dependency-free (the proxy imports it): the live category landing pages'
// slugs, /sydney/<slug>. tests/unit/seo.test.ts checks this matches
// categoryPages() in lib/seo.ts, which is built from lib/config.
export const LIVE_CATEGORY_SLUGS = [
  "photographers",
  "decorators",
  "djs",
  "celebrants",
  "florists",
  "caterers",
  "cakes-desserts",
  "videographers",
  "mcs",
  "makeup-artists",
  "event-planners",
] as const;

/**
 * True for /sydney/<slug> where <slug> isn't a live category. The page itself
 * streams behind app/loading.tsx, so its notFound() could only send a 200
 * ("soft 404"); the proxy answers these with a real 404 instead.
 */
export function isUnknownCategoryPage(pathname: string) {
  const match = pathname.match(/^\/sydney\/([^/]+)\/?$/);
  if (!match) return false;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return true;
  }
  return !(LIVE_CATEGORY_SLUGS as readonly string[]).includes(slug);
}
