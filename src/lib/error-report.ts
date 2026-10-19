import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

// Self-hosted error monitoring. Server errors arrive from onRequestError
// (src/instrumentation.ts), browser errors from /api/client-errors. Each is
// stored in public.error_events (service role only) and grouped by a
// fingerprint; the first occurrence of a fingerprint in 24 hours emails the
// admins. Reporting must never throw or slow the user down noticeably.

export type ErrorReport = {
  source: "server" | "client";
  message: string;
  stack?: string | null;
  digest?: string | null;
  path?: string | null;
  route?: string | null;
  userAgent?: string | null;
};

const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Drop query strings (reset codes, tokens) and secret path segments. */
export function scrubPath(path: string | null | undefined) {
  if (!path) return null;
  return path
    .split(/[?#]/)[0]
    .replace(/\/calendar-feed\/[^/]+/, "/calendar-feed/[token]")
    .slice(0, 300);
}

/** Groups "same error, different ids": strips UUIDs, hex ids and numbers. */
export function errorFingerprint(report: Pick<ErrorReport, "source" | "message" | "route" | "path">) {
  const message = report.message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hex>")
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
  const where = report.route || scrubPath(report.path) || "";
  return createHash("sha256").update(`${report.source}|${where}|${message}`).digest("hex").slice(0, 16);
}

export async function recordError(report: ErrorReport) {
  try {
    const admin = createAdminClient();
    if (!admin) return;

    const row = {
      source: report.source,
      message: report.message.slice(0, 1000) || "(no message)",
      stack: report.stack?.slice(0, 4000) ?? null,
      digest: report.digest?.slice(0, 100) ?? null,
      path: scrubPath(report.path),
      route: report.route?.slice(0, 300) ?? null,
      user_agent: report.userAgent?.slice(0, 300) ?? null,
      fingerprint: errorFingerprint(report),
    };

    const since = new Date(Date.now() - ALERT_WINDOW_MS).toISOString();
    const { data: recent } = await admin
      .from("error_events")
      .select("id")
      .eq("fingerprint", row.fingerprint)
      .gte("created_at", since)
      .limit(1);

    const { error } = await admin.from("error_events").insert(row);
    if (error) {
      console.error("[error-report] insert failed:", error.message);
      return;
    }
    if (recent && recent.length > 0) return;

    const { data: admins } = await admin.from("users").select("email").eq("role", "admin");
    await Promise.all(
      (admins ?? []).map((a) =>
        sendEmail({
          to: a.email,
          subject: `New ${row.source} error on Evntly: ${row.message.slice(0, 80)}`,
          heading: "A new error was recorded",
          lines: [
            `${row.source === "server" ? "Server" : "Browser"} error on ${row.path ?? row.route ?? "an unknown page"}.`,
            row.digest ? `Digest: ${row.digest}` : "You'll get one email per new error type each day.",
          ],
          quote: row.stack ?? row.message,
          cta: { label: "Open the admin error log", path: "/admin" },
        })
      )
    );
  } catch (err) {
    console.error("[error-report] failed:", err);
  }
}
