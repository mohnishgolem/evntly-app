import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";
import { FINISH_PATH, REMINDER_MAX_AGE_HOURS, pickListingReminders } from "@/lib/listing-completion";

// Called hourly by pg_cron (pg_net), see the listing_completion_gate
// migration. Authenticated with the shared secret in app_settings.
//
// Emails a vendor whose listing is still an unsubmitted draft without 3
// photos and a package, 24 h and 72 h after they saved it. Nothing else:
// listings that are complete, submitted, live or decided get no reminder,
// and neither do listings saved before this feature existed. Each reminder
// is logged in listing_completion_reminders first, so it is sent at most
// once, and notify() honours the vendor's "Reminders" email setting.

const BATCH = 100;

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

  const now = new Date();
  const oldest = new Date(now.getTime() - REMINDER_MAX_AGE_HOURS * 3600_000).toISOString();
  const { data: drafts, error } = await admin
    .from("service_providers")
    .select("id, name, owner_user_id, created_at")
    .eq("status", "draft")
    .eq("is_demo", false)
    .gte("created_at", oldest)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ error: "query failed" }, { status: 500 });
  if (!drafts?.length) return NextResponse.json({ sent: 0 });

  const ids = drafts.map((d) => d.id);
  const [{ data: photos }, { data: packages }, { data: sentRows }] = await Promise.all([
    admin.from("portfolio_items").select("provider_id").in("provider_id", ids),
    admin.from("vendor_packages").select("provider_id").in("provider_id", ids).eq("active", true),
    admin.from("listing_completion_reminders").select("provider_id, kind").in("provider_id", ids),
  ]);

  const due = pickListingReminders(drafts, { photos: photos ?? [], packages: packages ?? [], sent: sentRows ?? [] }, now);
  if (!due.length) return NextResponse.json({ sent: 0 });

  const userIds = [...new Set(due.map((d) => d.ownerUserId).filter((id): id is string => !!id))];
  const { data: users } = userIds.length
    ? await admin.from("users").select("id, email").in("id", userIds)
    : { data: [] as { id: string; email: string | null }[] };
  const emailOf = new Map((users ?? []).map((u) => [u.id, u.email]));

  let sent = 0;
  for (const d of due) {
    const to = d.ownerUserId ? emailOf.get(d.ownerUserId) : null;
    if (!to) continue;
    // Log first: a second run can't send the same reminder again.
    const { data: logged } = await admin
      .from("listing_completion_reminders")
      .upsert({ provider_id: d.providerId, kind: d.kind }, { onConflict: "provider_id,kind", ignoreDuplicates: true })
      .select("provider_id");
    if (!logged?.length) continue;

    const missing = [
      d.photos < 3 ? `${3 - d.photos} more photo${3 - d.photos === 1 ? "" : "s"} of your work` : null,
      d.packages < 1 ? "one package (what's included and the price)" : null,
    ].filter(Boolean);
    notify({
      category: "reminders",
      to,
      subject: d.kind === "24h" ? `Finish your ${d.name} listing on Evntly` : `Your ${d.name} listing is still a draft`,
      heading: d.kind === "24h" ? "Your listing is almost ready" : "Customers can't see your listing yet",
      lines: [
        `${d.name} is saved as a draft. To send it for review, add ${missing.join(" and ")}.`,
        "Short on time? Choose \"Set it up for me\" on the same page, send us your prices and photos, and we'll prepare it for you to check.",
      ],
      cta: { label: "Finish my listing", path: FINISH_PATH },
    });
    sent++;
  }

  return NextResponse.json({ sent });
}
