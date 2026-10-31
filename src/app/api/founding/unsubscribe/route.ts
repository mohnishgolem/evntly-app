import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

// RFC 8058 one-click unsubscribe, named in the invitation's List-Unsubscribe
// header. Mail apps POST "List-Unsubscribe=One-Click" here; no page, no
// sign-in. Always 200 so the response doesn't reveal whether a token matched.
export async function POST(request: NextRequest) {
  const ok = new NextResponse("Unsubscribed", { status: 200 });
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return ok;
  if (!(await checkRateLimit("unsubscribeIp", clientIpFrom(request.headers)))) return ok;
  const admin = createAdminClient();
  if (!admin) return ok;
  const { error } = await admin.rpc("beta_unsubscribe", { p_token: token });
  if (error) console.error("[founding] one-click unsubscribe failed:", error.message);
  return ok;
}
