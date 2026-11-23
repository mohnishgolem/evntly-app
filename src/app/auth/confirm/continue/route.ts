import { NextResponse, type NextRequest } from "next/server";
import { confirmEmailLinkDestination } from "@/lib/actions/auth";

// The "Continue" button on /auth/confirm posts here. Using the token sets the
// sign-in cookies on this response, and the 303 makes the browser load the
// destination as a normal page: it renders signed in, and a return to a
// vendor's quote form (?book=1) reopens it (an in-app redirect didn't).
export async function POST(request: NextRequest) {
  // Same-site only, like a server action: another site must not be able to
  // post its own token here and sign the visitor into a different account.
  // The confirm page sends no referrer (it carries a token), which makes
  // browsers send "Origin: null" on this post, so trust Sec-Fetch-Site first.
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const crossSite = site ? site !== "same-origin" : !!origin && origin !== "null" && origin !== request.nextUrl.origin;
  if (crossSite) {
    return NextResponse.redirect(new URL("/login?notice=signin-failed", request.url), 303);
  }
  const destination = await confirmEmailLinkDestination(await request.formData());
  return NextResponse.redirect(new URL(destination, request.url), 303);
}
