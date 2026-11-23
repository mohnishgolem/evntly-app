import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { isBotUserAgent, PAGE_VIEW_KINDS, parseSourceParams, type PageViewKind } from "@/lib/page-views";
import { campaignFromParams, foundingCookieWrites, sourceFromParams } from "@/lib/founding/sources";
import { isShareSource, SHARE_PREPARED_ACTIONS, type SharePreparedAction } from "@/lib/share-profile";
import { recordSharePrepared } from "@/lib/share-funnel";
import { CLIENT_FUNNEL_EVENTS, foundingSourceFromCookie, isFunnelEvent, recordFunnelEvent } from "@/lib/funnel-events";

// Anonymous page-view counts for the admin funnel (see <PageViewTracker>).
// Same-origin, tiny allow-listed payload, rate-limited per IP; always 204.
export async function POST(request: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return done;
  // Crawlers (ad review, link previews, search) aren't visitors.
  if (isBotUserAgent(request.headers.get("user-agent"))) return done;

  const raw = await request.text();
  if (!raw || raw.length > 512) return done;
  let body: { kind?: unknown; event?: unknown; visitorId?: unknown; vendorId?: unknown; params?: unknown; share?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return done;
  }

  // Share profile: a vendor saved, copied or shared their artwork or link.
  // Counted as "prepared to share" only — it can't tell whether they posted.
  // Signed-in owners of the listing only.
  if (body.share !== undefined) {
    const share = body.share as { action?: unknown; vendorId?: unknown } | null;
    const action = share?.action as SharePreparedAction;
    const vendorId = typeof share?.vendorId === "string" && /^[0-9a-f-]{36}$/.test(share.vendorId) ? share.vendorId : null;
    if (!vendorId || !SHARE_PREPARED_ACTIONS.includes(action)) return done;
    if (!(await checkRateLimit("pageViewIp", clientIpFrom(request.headers)))) return done;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return done;
    const { data: own } = await supabase.rpc("my_service_providers").select("id").eq("id", vendorId).maybeSingle();
    if (own) await recordSharePrepared(user.id, vendorId, action);
    return done;
  }

  // Founding funnel steps the browser reports (claim click, sign-up attempt).
  // The source comes from the evntly_fv_src cookie, not the request body.
  if (body.event !== undefined) {
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
    if (!isFunnelEvent(body.event) || !CLIENT_FUNNEL_EVENTS.includes(body.event) || !/^[A-Za-z0-9-]{8,64}$/.test(visitorId)) return done;
    if (!(await checkRateLimit("pageViewIp", clientIpFrom(request.headers)))) return done;
    // The page's own link tags win over the cookie (as for page views): in
    // Facebook's in-app browser the cookie saved on the ad's landing page may
    // be missing by the time the visitor taps Claim.
    const params = parseSourceParams(body.params);
    const source = params ? sourceFromParams(params) : null;
    if (!source) {
      await recordFunnelEvent(body.event, { visitorId });
      return done;
    }
    const campaign = campaignFromParams(params!);
    await recordFunnelEvent(body.event, { visitorId, source, campaign });
    // Save them now if this browser has no source yet, so the later
    // server-side steps (account created, email confirmed) are credited too.
    // Same first-party cookies <SourceCookie> writes; nothing ad-related.
    if (!(await foundingSourceFromCookie())) {
      for (const c of foundingCookieWrites({ source, campaign }, request.nextUrl.protocol === "https:")) done.headers.append("Set-Cookie", c);
    }
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
  let source: string | null = null;
  if (kind === "founding" || kind === "founding_claim") {
    const params = parseSourceParams(body.params);
    source = (params && sourceFromParams(params)) || (await foundingSourceFromCookie());
  } else if (kind === "vendor") {
    // A vendor's Share profile link or QR code (?src=share_*); other vendor
    // page views keep no source.
    const src = parseSourceParams(body.params)?.src;
    if (isShareSource(src)) source = src;
  }
  // Only sent when there is one, so other page views keep working if this
  // code is ever live before the page_views.source migration.
  await admin
    .from("page_views")
    .insert({ kind, visitor_id: visitorId, vendor_id: vendorId, user_id: user?.id ?? null, ...(source ? { source } : {}) });
  return done;
}
