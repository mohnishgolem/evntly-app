import type { NextConfig } from "next";

// Baseline security headers on every response. No script-src/connect-src
// allow-list yet — maps, Supabase, Google sign-in and analytics need a
// carefully tested one (nonces force dynamic rendering) — but these
// directives are safe everywhere: no clickjacking, no <base> hijacking, no
// plugins, and forms (incl. the no-JS OAuth redirect) only post to us,
// Supabase or Google.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";
const csp = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  `form-action 'self' ${supabaseOrigin} https://accounts.google.com https://appleid.apple.com`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation stays available to our own pages for the map's
  // "show my location" button; nothing else is used.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  // The attachment scanner's OCR engine loads a worker script and WASM from
  // node_modules at runtime, which the bundler can't see — keep it external
  // and ship its files with the messages routes (where sendReply runs).
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "heic-convert", "heic-decode", "libheif-js"],
  outputFileTracingIncludes: {
    // The worker script's own requires aren't traced either (it's spawned by
    // path), so list its dependencies explicitly.
    "/messages/**": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*",
      "./node_modules/heic-convert/**/*",
      "./node_modules/heic-decode/**/*",
      "./node_modules/libheif-js/**/*",
      "./node_modules/jpeg-js/**/*",
      "./node_modules/pngjs/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/zlibjs/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/idb-keyval/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/node-fetch/**/*",
      "./node_modules/whatwg-url/**/*",
      "./node_modules/tr46/**/*",
      "./node_modules/webidl-conversions/**/*",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
