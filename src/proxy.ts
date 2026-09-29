import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed Middleware to Proxy (same runtime semantics).
// This only refreshes the Supabase session cookie — it must never redirect,
// since Evntly's public pages (home, explore, vendor detail) have to render
// with zero auth. Gating happens at the point of the protected action instead.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
