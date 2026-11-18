// Kept dependency-free so the proxy can import it without pulling in
// lib/config (and its icon imports). tests/unit/seo.test.ts checks this
// matches SITE_URL.
export const CANONICAL_HOST = "evntlyapp.com";

/**
 * True for any host other than the production domain (the old
 * evntly-tau.vercel.app address and Vercel preview deployments), which serve
 * the same pages and must stay out of search results.
 */
export function isNonCanonicalHost(host: string | null | undefined) {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  if (h === "localhost" || h === "127.0.0.1") return false;
  return h !== CANONICAL_HOST;
}
