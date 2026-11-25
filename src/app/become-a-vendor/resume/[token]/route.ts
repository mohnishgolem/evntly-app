import { NextResponse, type NextRequest } from "next/server";
import { recordFunnelEvent } from "@/lib/funnel-events";
import { draftByToken, setDraftCookie } from "@/lib/vendor-journey/server";

// The private "continue your listing" link from emailDraftLink. Puts the
// draft on this browser (httpOnly cookie) and moves on to a URL without the
// token, so it isn't left in history or sent on as a referrer.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await draftByToken(token);
  if (!found || found.row.origin !== "self") {
    return NextResponse.redirect(new URL("/become-a-vendor?link=expired", request.url));
  }
  await setDraftCookie(token);
  await recordFunnelEvent("draft_resumed", { source: null });
  const res = NextResponse.redirect(new URL("/become-a-vendor/start", request.url));
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
