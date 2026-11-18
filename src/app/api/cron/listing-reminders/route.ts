import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";
import { reminderEmail } from "@/lib/listing-reminder-email";
import {
  APPROVED_INCOMPLETE_SKIP,
  APPROVED_INCOMPLETE_SWITCH,
  REMINDER_MAX_AGE_HOURS,
  parseSkipList,
  pickApprovedIncompleteReminders,
  pickListingReminders,
  type DueApprovedReminder,
  type DueListingReminder,
} from "@/lib/listing-completion";

// Called hourly by pg_cron (pg_net), see the listing_completion_gate
// migration. Authenticated with the shared secret in app_settings.
//
// Emails a vendor whose listing is still an unsubmitted draft without 3
// photos and a package, 24 h and 72 h after they saved it. Nothing else:
// listings that are complete, submitted, live or decided get no reminder,
// and neither do listings saved before this feature existed.
//
// Second, OFF unless app_settings.approved_incomplete_reminders = 'on': one
// email (ever) to each live listing that was approved before the gate and
// still has no photos or package. Ids in approved_incomplete_reminders_skip
// are left out. The 'approved_incomplete' log kind needs migration
// 20261120090000; until it's applied the log insert fails and nothing is
// sent. Each reminder
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
  const drafts = await draftReminders(admin, now);
  if (drafts === null) return NextResponse.json({ error: "query failed" }, { status: 500 });
  const approved = await approvedIncompleteReminders(admin);

  const due: (DueListingReminder | DueApprovedReminder)[] = [...drafts, ...approved];
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
    notify({ category: "reminders", to, ...reminderEmail(d) });
    sent++;
  }

  return NextResponse.json({ sent });
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function draftReminders(admin: Admin, now: Date): Promise<DueListingReminder[] | null> {
  const oldest = new Date(now.getTime() - REMINDER_MAX_AGE_HOURS * 3600_000).toISOString();
  const { data: drafts, error } = await admin
    .from("service_providers")
    .select("id, name, owner_user_id, created_at")
    .eq("status", "draft")
    .eq("is_demo", false)
    .gte("created_at", oldest)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return null;
  if (!drafts?.length) return [];
  const ids = drafts.map((d) => d.id);
  const [{ data: photos }, { data: packages }, { data: sentRows }] = await Promise.all([
    admin.from("portfolio_items").select("provider_id").in("provider_id", ids),
    admin.from("vendor_packages").select("provider_id").in("provider_id", ids).eq("active", true),
    admin.from("listing_completion_reminders").select("provider_id, kind").in("provider_id", ids),
  ]);
  return pickListingReminders(drafts, { photos: photos ?? [], packages: packages ?? [], sent: sentRows ?? [] }, now);
}

async function approvedIncompleteReminders(admin: Admin): Promise<DueApprovedReminder[]> {
  const { data: settings } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", [APPROVED_INCOMPLETE_SWITCH, APPROVED_INCOMPLETE_SKIP]);
  const setting = (key: string) => settings?.find((r) => r.key === key)?.value ?? null;
  if (setting(APPROVED_INCOMPLETE_SWITCH)?.trim() !== "on") return [];

  const { data: listings, error } = await admin
    .from("service_providers")
    .select("id, name, owner_user_id")
    .eq("status", "approved")
    .eq("is_demo", false)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error || !listings?.length) return [];
  const ids = listings.map((l) => l.id);
  const [{ data: photos }, { data: packages }, { data: sentRows }] = await Promise.all([
    admin.from("portfolio_items").select("provider_id").in("provider_id", ids),
    admin.from("vendor_packages").select("provider_id").in("provider_id", ids).eq("active", true),
    admin.from("listing_completion_reminders").select("provider_id, kind").in("provider_id", ids),
  ]);
  return pickApprovedIncompleteReminders(
    listings,
    { photos: photos ?? [], packages: packages ?? [], sent: sentRows ?? [] },
    parseSkipList(setting(APPROVED_INCOMPLETE_SKIP)),
  );
}
