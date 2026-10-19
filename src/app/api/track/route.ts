import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { PAGE_VIEW_KINDS, type PageViewKind } from "@/lib/page-views";

// Anonymous page-view counts for the admin funnel (see <PageViewTracker>).
// Same-origin, tiny allow-listed payload, rate-limited per IP; always 204.
export async function POST(request: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return done;

  const raw = await request.text();
  if (!raw || raw.length > 512) return done;
  let body: { kind?: unknown; visitorId?: unknown; vendorId?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
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
  await admin.from("page_views").insert({ kind, visitor_id: visitorId, vendor_id: vendorId, user_id: user?.id ?? null });
  return done;
}
