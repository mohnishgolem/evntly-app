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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
