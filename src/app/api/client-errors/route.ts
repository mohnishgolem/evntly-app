import { NextResponse, type NextRequest } from "next/server";
import { recordError } from "@/lib/error-report";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

// Browser error reports from <ErrorReporter> and the error boundaries.
// Same-origin only, small bodies, rate-limited per IP; always answers 204 so
// a failing reporter never produces more errors in the browser.
const MAX_BODY_BYTES = 8 * 1024;

export async function POST(request: NextRequest) {
  const done = new NextResponse(null, { status: 204 });

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return done;

  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY_BYTES) return done;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return done;
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return done;

  if (!(await checkRateLimit("clientErrorIp", clientIpFrom(request.headers)))) return done;

  const str = (v: unknown) => (typeof v === "string" ? v : null);
  await recordError({
    source: "client",
    message,
    stack: str(body.stack),
    digest: str(body.digest),
    path: str(body.path),
    userAgent: request.headers.get("user-agent"),
  });
  return done;
}
