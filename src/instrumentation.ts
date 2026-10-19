import type { Instrumentation } from "next";

// Server errors (rendering, route handlers, server actions, proxy) go to the
// self-hosted error log. Imported lazily so the Node-only reporter never
// loads in the edge runtime.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/error-report");
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : null;
  const userAgent = request.headers["user-agent"];
  await recordError({
    source: "server",
    message,
    stack: err instanceof Error ? err.stack : null,
    digest,
    path: request.path,
    route: `${context.routeType} ${context.routePath}`,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
  });
};
