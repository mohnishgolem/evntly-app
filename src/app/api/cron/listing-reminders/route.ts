import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";
import { FINISH_PATH, REMINDER_MAX_AGE_HOURS, pickListingReminders } from "@/lib/listing-completion";
import {
  LIVE_INCOMPLETE_MAX_AGE_HOURS,
  NO_LISTING_MAX_AGE_HOURS,
  ONBOARDING_REMINDERS_FROM,
  onboardingReminderEmail,
  pickLiveIncompleteReminders,
  pickNoListingReminders,
  type DueOnboardingReminder,
} from "@/lib/onboarding-reminders";

// Called hourly by pg_cron (pg_net), see the listing_completion_gate
// migration. Authenticated with the shared secret in app_settings.
//
// Emails a vendor whose listing is still an unsubmitted draft without 3
// photos and a package, 24 h and 72 h after they saved it. Nothing else:
// listings that are complete, submitted, live or decided get no reminder,
// and neither do listings saved before this feature existed. Each reminder
// is logged in listing_completion_reminders first, so it is sent at most
// once, and notify() honours the vendor's "Reminders" email setting.
//
// Also (onboarding review item 2, needs migration 20261127090000): vendors who
// claimed a Founding place but never saved a listing, and live listings still
// missing photos or a package. See src/lib/onboarding-reminders.ts.

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
  const drafts = await sendDraftReminders(admin, now);
  const onboarding = await sendOnboardingReminders(admin, now);
  if (drafts === null) return NextResponse.json({ error: "query failed" }, { status: 500 });
  return NextResponse.json({ sent: drafts, ...onboarding });
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Draft listings missing photos or a package (24 h and 72 h). Null if the query failed. */
async function sendDraftReminders(admin: Admin, now: Date): Promise<number | null> {
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
  if (!drafts?.length) return 0;

  const ids = drafts.map((d) => d.id);
  const [{ data: photos }, { data: packages }, { data: sentRows }] = await Promise.all([
    admin.from("portfolio_items").select("provider_id").in("provider_id", ids),
    admin.from("vendor_packages").select("provider_id").in("provider_id", ids).eq("active", true),
    admin.from("listing_completion_reminders").select("provider_id, kind").in("provider_id", ids),
  ]);

  const due = pickListingReminders(drafts, { photos: photos ?? [], packages: packages ?? [], sent: sentRows ?? [] }, now);
  if (!due.length) return 0;

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
  return sent;
}

/**
 * No-listing and live-but-incomplete reminders. Never blocks the draft
 * reminders: if the new table isn't there yet (migration not applied), the
 * log write fails and nothing is sent.
 */
async function sendOnboardingReminders(admin: Admin, now: Date): Promise<{ noListing: number; liveIncomplete: number }> {
  const result = { noListing: 0, liveIncomplete: 0 };
  try {
    const since = (hours: number) => new Date(Math.max(ONBOARDING_REMINDERS_FROM, now.getTime() - hours * 3600_000)).toISOString();

    // A. Claimed a Founding place, no listing yet.
    const { data: apps } = await admin
      .from("beta_applications")
      .select("user_id, campaign, created_at")
      .eq("status", "started")
      .is("provider_id", null)
      .gte("created_at", since(NO_LISTING_MAX_AGE_HOURS))
      .limit(BATCH);

    // C. Live listings (approved) created or approved since the cut-off.
    const { data: listings } = await admin
      .from("service_providers")
      .select("id, name, owner_user_id, is_demo, created_at")
      .eq("status", "approved")
      .eq("is_demo", false)
      .not("owner_user_id", "is", null)
      .gte("updated_at", since(LIVE_INCOMPLETE_MAX_AGE_HOURS))
      .limit(BATCH);

    const appUserIds = (apps ?? []).map((a) => a.user_id as string).filter(Boolean);
    const listingIds = (listings ?? []).map((l) => l.id as string);
    const ownerIds = (listings ?? []).map((l) => l.owner_user_id as string);
    const userIds = [...new Set([...appUserIds, ...ownerIds])];
    if (!userIds.length) return result;

    const [{ data: users }, { data: owned }, { data: decided }, { data: photos }, { data: packages }, { data: sent, error: sentError }] = await Promise.all([
      admin.from("users").select("id, email, role").in("id", userIds),
      appUserIds.length ? admin.from("service_providers").select("owner_user_id").in("owner_user_id", appUserIds) : Promise.resolve({ data: [] }),
      ownerIds.length
        ? admin.from("beta_applications").select("user_id, campaign, decided_at").in("user_id", ownerIds).eq("status", "approved")
        : Promise.resolve({ data: [] }),
      listingIds.length ? admin.from("portfolio_items").select("provider_id").in("provider_id", listingIds) : Promise.resolve({ data: [] }),
      listingIds.length ? admin.from("vendor_packages").select("provider_id").in("provider_id", listingIds).eq("active", true) : Promise.resolve({ data: [] }),
      admin.from("vendor_onboarding_reminders").select("user_id, kind").in("user_id", userIds),
    ]);
    if (sentError) return result; // migration not applied yet: send nothing

    const userOf = new Map((users ?? []).map((u) => [String(u.id), u as { id: string; email: string | null; role: string | null }]));
    const hasListing = new Set((owned ?? []).map((o) => String((o as { owner_user_id: string }).owner_user_id)));
    const decidedOf = new Map(
      ((decided ?? []) as { user_id: string; campaign: string | null; decided_at: string | null }[]).map((d) => [String(d.user_id), d])
    );
    const count = (rows: { provider_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.provider_id === id).length;
    const sentRows = (sent ?? []) as { user_id: string; kind: string }[];

    const noListing = pickNoListingReminders(
      (apps ?? []).map((a) => {
        const u = userOf.get(String(a.user_id));
        return {
          userId: String(a.user_id),
          email: u?.email ?? null,
          role: u?.role ?? null,
          campaign: a.campaign as string | null,
          claimedAt: a.created_at as string,
          hasListing: hasListing.has(String(a.user_id)),
        };
      }),
      sentRows,
      now
    );
    const liveIncomplete = pickLiveIncompleteReminders(
      (listings ?? []).map((l) => {
        const owner = String(l.owner_user_id);
        const u = userOf.get(owner);
        const d = decidedOf.get(owner);
        return {
          userId: owner,
          email: u?.email ?? null,
          role: u?.role ?? null,
          campaign: d?.campaign ?? null,
          listingName: l.name as string,
          isDemo: !!l.is_demo,
          liveSince: d?.decided_at ?? (l.created_at as string),
          photos: count(photos as { provider_id: string }[] | null, l.id as string),
          packages: count(packages as { provider_id: string }[] | null, l.id as string),
        };
      }),
      sentRows,
      now
    );

    const send = async (r: DueOnboardingReminder) => {
      // Log first: a second run can't send the same reminder again.
      const { data: logged, error } = await admin
        .from("vendor_onboarding_reminders")
        .upsert({ user_id: r.userId, kind: r.kind }, { onConflict: "user_id,kind", ignoreDuplicates: true })
        .select("user_id");
      if (error || !logged?.length) return false;
      notify({ category: "reminders", to: r.email, ...onboardingReminderEmail(r) });
      return true;
    };
    for (const r of noListing) if (await send(r)) result.noListing++;
    for (const r of liveIncomplete) if (await send(r)) result.liveIncomplete++;
  } catch (e) {
    console.error("[listing-reminders] onboarding reminders failed:", e instanceof Error ? e.message : e);
  }
  return result;
}
