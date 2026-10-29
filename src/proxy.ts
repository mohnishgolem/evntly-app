import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp, generateNonce } from "@/lib/csp";
import { BOOK_INTENT_COOKIE, BOOK_INTENT_MAX_AGE_SECONDS, bookIntentPath, bookIntentRedirect } from "@/lib/booking-intent";

// Next.js 16 renamed Middleware to Proxy (same runtime semantics).
// This refreshes the Supabase session cookie. Public pages (home, explore,
// vendor detail) must never redirect — they render with zero auth.
//
// Signed-out page loads under the account-only sections below go straight
// to login here, before anything renders. The pages check the session
// themselves too (that's the real gate); this only keeps the redirect an
// immediate 307 now that pages stream behind app/loading.tsx, where a
// redirect from the page itself becomes a delayed client-side one.
//
// It also sets a nonce-based Content-Security-Policy for every page: Next.js
// reads the nonce from the request's CSP header and stamps it on its scripts.
//
// /vendor/<id>?book=1 (back from sign-up to book) becomes a short-lived
// cookie plus a redirect to the clean URL; see lib/booking-intent.ts.
export async function proxy(request: NextRequest) {
  const csp = buildCsp(generateNonce());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const { response, signedIn } = await updateSession(request, requestHeaders);

  const { pathname, search } = request.nextUrl;
  const intent = request.method === "GET" || request.method === "HEAD" ? bookIntentRedirect(request.nextUrl) : null;
  if (intent) {
    const redirect = NextResponse.redirect(intent.clean, 307);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.cookies.set(BOOK_INTENT_COOKIE, "1", {
      path: bookIntentPath(intent.vendorId),
      maxAge: BOOK_INTENT_MAX_AGE_SECONDS,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    return redirect;
  }

  if (!signedIn && (request.method === "GET" || request.method === "HEAD") && isAccountOnly(pathname)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(login, 307);
    // Keep any cookie changes from the session refresh (e.g. clearing an
    // expired session).
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

const ACCOUNT_ONLY = ["/dashboard", "/messages", "/profile", "/saved", "/bookings", "/vendor-dashboard", "/admin"];

function isAccountOnly(pathname: string) {
  return ACCOUNT_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|calendar-feed|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
