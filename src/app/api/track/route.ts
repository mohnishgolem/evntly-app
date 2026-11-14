import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { PAGE_VIEW_KINDS, parseSourceParams, type PageViewKind } from "@/lib/page-views";
import { sourceFromParams } from "@/lib/founding/sources";
import { CLIENT_FUNNEL_EVENTS, foundingSourceFromCookie, isFunnelEvent, recordFunnelEvent } from "@/lib/funnel-events";

// Anonymous page-view counts for the admin funnel (see <PageViewTracker>).
// Same-origin, tiny allow-listed payload, rate-limited per IP; always 204.
export async function POST(request: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return done;

  const raw = await request.text();
  if (!raw || raw.length > 512) return done;
  let body: { kind?: unknown; event?: unknown; visitorId?: unknown; vendorId?: unknown; params?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return done;
  }

  // Founding funnel steps the browser reports (claim click, sign-up attempt).
  // The source comes from the evntly_fv_src cookie, not the request body.
  if (body.event !== undefined) {
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
    if (!isFunnelEvent(body.event) || !CLIENT_FUNNEL_EVENTS.includes(body.event) || !/^[A-Za-z0-9-]{8,64}$/.test(visitorId)) return done;
    if (!(await checkRateLimit("pageViewIp", clientIpFrom(request.headers)))) return done;
    await recordFunnelEvent(body.event, { visitorId });
    return done;
  }
  const kind = body.kind as PageViewKind;
  const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
  const vendorId = typeof body.vendorId === "string" && /^[0-9a-f-]{36}$/.test(body.vendorId) ? body.vendorId : null;
  if (!PAGE_VIEW_KINDS.includes(kind) || !/^[A-Za-z0-9-]{8,64}$/.test(visitorId)) return done;

  if (!(await checkRateLimit("pageViewIp", clientIpFrom(request.headers)))) return done;

  const admin = createAdminClient();
  if (!admin) return done;
  // Signed-in views carry the user id so admins' own browsing can be excluded.
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  // Founding pages also record which founding link brought the visitor, so ad
  // visits can be told from organic. The page's own link tags win: the
  // landing view can arrive before <SourceCookie> has saved them, and the
  // cookie may still hold an earlier visit's source. Without tags, the cookie
  // (the same one funnel events use) carries the source between pages.
  let source = null;
  if (kind === "founding" || kind === "founding_claim") {
    const params = parseSourceParams(body.params);
    source = (params && sourceFromParams(params)) || (await foundingSourceFromCookie());
  }
  // Only sent when there is one, so other page views keep working if this
  // code is ever live before the page_views.source migration.
  await admin
    .from("page_views")
    .insert({ kind, visitor_id: visitorId, vendor_id: vendorId, user_id: user?.id ?? null, ...(source ? { source } : {}) });
  return done;
}
