// Content-Security-Policy with a per-request nonce (set in src/proxy.ts).
// Only scripts carrying the nonce — Next.js attaches it to its own scripts
// and to <Script> tags automatically — or loaded by them ('strict-dynamic')
// can run, so an injected <script> or inline event handler is refused.
//
// Allow-list: Supabase (REST, auth, storage, realtime websockets), OpenFreeMap
// (map styles, tiles, glyphs, sprites), the MapLibre worker (served from
// /maplibre, plus blob: workers), and Google/Apple sign-in as form targets.
// Styles keep 'unsafe-inline': React style props render as style attributes,
// and CSS injection is far lower risk than script injection.

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";
const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");
const MAP_ORIGIN = "https://tiles.openfreemap.org";
// Demo/seed vendor photos are hot-linked from Unsplash (the only external
// image host in the data); vendor uploads live in Supabase storage.
const IMAGE_HOSTS = "https://images.unsplash.com";

export function buildCsp(nonce: string, isDev = process.env.NODE_ENV === "development") {
  return [
    "default-src 'self'",
    // 'unsafe-eval' only in dev: React uses eval there for error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseOrigin} ${MAP_ORIGIN} ${IMAGE_HOSTS}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${MAP_ORIGIN}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${supabaseOrigin} https://accounts.google.com https://appleid.apple.com`,
    "frame-ancestors 'none'",
  ].join("; ");
}

export function generateNonce() {
  return btoa(crypto.randomUUID());
}
