import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, generateNonce } from "@/lib/csp";

// Next.js 16 renamed Middleware to Proxy (same runtime semantics).
// This only refreshes the Supabase session cookie — it must never redirect,
// since Evntly's public pages (home, explore, vendor detail) have to render
// with zero auth. Gating happens at the point of the protected action instead.
//
// It also sets a nonce-based Content-Security-Policy for every page: Next.js
// reads the nonce from the request's CSP header and stamps it on its scripts.
export async function proxy(request: NextRequest) {
  const csp = buildCsp(generateNonce());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|calendar-feed|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
