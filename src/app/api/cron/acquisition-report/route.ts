import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBetaAdminData } from "@/lib/data/admin-founding";
import { getAcquisitionData } from "@/lib/data/admin-acquisition";
import { buildDailyReport } from "@/lib/acquisition/report";
import { sendEmail } from "@/lib/email";

// Called once a day by pg_cron (pg_net); see the vendor_acquisition
// migration. Authenticated with the shared cron secret in app_settings.
// Emails the daily acquisition report to admins only. It never contacts
// vendors or prospects.

function secretsMatch(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "cron_secret").maybeSingle();
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!setting?.value || !secretsMatch(given, setting.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const beta = await getBetaAdminData({ serviceClient: admin });
  if (!beta.deployed) return NextResponse.json({ sent: 0, skipped: "founding tables missing" });
  const acquisition = await getAcquisitionData(beta, { serviceClient: admin });
  const report = buildDailyReport(beta, acquisition);

  const { data: admins } = await admin.from("users").select("email").eq("role", "admin").is("suspended_at", null).limit(10);
  const recipients = [...new Set((admins ?? []).map((a) => a.email?.trim().toLowerCase()).filter((e): e is string => !!e))];
  for (const to of recipients) {
    await sendEmail({ to, subject: report.subject, heading: report.heading, lines: report.lines, cta: { label: "Open Beta Vendors", path: "/admin/beta-vendors" } });
  }
  // Counts only in the log; no addresses.
  console.info(`[acquisition-report] sent to ${recipients.length} admin(s)`);
  return NextResponse.json({ sent: recipients.length });
}
