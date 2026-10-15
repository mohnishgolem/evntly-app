import type { NextConfig } from "next";

// Baseline security headers on every response. No full Content-Security-
// Policy yet — maps, Supabase, Google sign-in and analytics need a carefully
// tested allow-list — but frame-ancestors alone stops clickjacking.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
