import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// `requestHeaders` lets the proxy forward extra request headers (the CSP
// nonce) to the page render alongside the refreshed session cookies.
export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  const next = () =>
    requestHeaders ? NextResponse.next({ request: { headers: requestHeaders } }) : NextResponse.next({ request });
  let supabaseResponse = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
            // NextResponse.next({ request: { headers } }) forwards these
            // headers, not request.cookies — keep the cookie header in sync.
            requestHeaders?.set("cookie", request.cookies.toString());
          });
          supabaseResponse = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session (and cookies) if needed. Note: no route protection
  // here — Evntly's public pages (home, explore, vendor detail) must never
  // redirect to login. Auth is checked at the point of the gated action.
  await supabase.auth.getUser();

  return supabaseResponse;
}
