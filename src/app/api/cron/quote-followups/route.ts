import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findSimilarVendors } from "@/lib/data/vendors";
import { notify, formatEventDate, formatAmount } from "@/lib/email";
import { SITE_URL, categoryPlural } from "@/lib/config";
import { formatAudDollars } from "@/lib/payments/money";

// Called every 15 minutes by pg_cron (pg_net) — see the quote_followups
// migration. Authenticated with a shared secret stored in app_settings,
// which only the service role can read.
//
//  1. Vendor hasn't replied and the request expires within 24h → remind the vendor.
//  2. Vendor quoted, organiser hasn't accepted, expires within 24h → remind the organiser.
//  3. Request expired with no reply → tell the organiser, with similar vendors.
//
// Each sends once (a *_sent_at column is stamped) and runs in small batches.

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 50;

function secretsMatch(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!setting?.value || !secretsMatch(given, setting.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const soon = new Date(now.getTime() + DAY_MS).toISOString();
  const nowIso = now.toISOString();
  const columns =
    "id, status, vendor_id, vendor_name, vendor_user_id, client_user_id, service_type, event_type, event_date, location, quoted_amount, expires_at";

  const [vendorDue, clientDue, expiredDue] = await Promise.all([
    admin
      .from("quote_requests")
      .select(columns)
      .eq("status", "pending")
      .is("vendor_reminder_sent_at", null)
      .gt("expires_at", nowIso)
      .lte("expires_at", soon)
      .limit(BATCH),
    admin
      .from("quote_requests")
      .select(columns)
      .eq("status", "quoted")
      .is("client_reminder_sent_at", null)
      .gt("expires_at", nowIso)
      .lte("expires_at", soon)
      .limit(BATCH),
    admin
      .from("quote_requests")
      .select(columns)
      .in("status", ["pending", "expired"])
      .is("quoted_amount", null)
      .is("expiry_notice_sent_at", null)
      .lte("expires_at", nowIso)
      .limit(BATCH),
  ]);

  // Current account emails by user id (stored emails can be stale).
  const userIds = [
    ...(vendorDue.data ?? []).map((q) => q.vendor_user_id),
    ...(clientDue.data ?? []).map((q) => q.client_user_id),
    ...(expiredDue.data ?? []).map((q) => q.client_user_id),
  ].filter((id): id is string => !!id);
  const { data: users } = userIds.length
    ? await admin.from("users").select("id, email").in("id", [...new Set(userIds)])
    : { data: [] };
  const emailOf = new Map((users ?? []).map((u) => [u.id, u.email]));

  type SentColumn = "vendor_reminder_sent_at" | "client_reminder_sent_at" | "expiry_notice_sent_at";
  const stamp = (ids: string[], column: SentColumn) =>
    ids.length
      ? admin
          .from("quote_requests")
          .update({ [column]: nowIso } as Partial<Record<SentColumn, string>>)
          .in("id", ids)
      : null;

  for (const q of vendorDue.data ?? []) {
    notify({
      category: "reminders",
      to: q.vendor_user_id ? emailOf.get(q.vendor_user_id) : null,
      subject: `Reply today: quote request for ${formatEventDate(q.event_date)} expires soon`,
      heading: "A quote request is about to expire",
      lines: [
        `Someone asked you for a quote for their ${(q.event_type ?? "event").toLowerCase()} on ${formatEventDate(q.event_date)}${q.location ? ` in ${q.location}` : ""}.`,
        "It expires in under 24 hours. Send a price or decline so they can plan.",
      ],
      cta: { label: "Reply now", path: "/vendor-dashboard/enquiries" },
    });
  }

  for (const q of clientDue.data ?? []) {
    notify({
      category: "reminders",
      to: q.client_user_id ? emailOf.get(q.client_user_id) : null,
      subject: `${q.vendor_name ?? "Your vendor"}'s quote expires soon`,
      heading: "Your quote expires in under 24 hours",
      lines: [
        `${q.vendor_name ?? "The vendor"} quoted ${formatAmount(q.quoted_amount)} for your ${(q.event_type ?? "event").toLowerCase()} on ${formatEventDate(q.event_date)}.`,
        "Accept it to lock in the date, or let it lapse if you've gone another way.",
      ],
      cta: { label: "Review quote", path: "/dashboard/quotes" },
    });
  }

  for (const q of expiredDue.data ?? []) {
    const similar = q.service_type
      ? await findSimilarVendors(admin, q.service_type, q.vendor_id ? [q.vendor_id] : [])
      : [];
    notify({
      category: "reminders",
      to: q.client_user_id ? emailOf.get(q.client_user_id) : null,
      subject: `${q.vendor_name ?? "A vendor"} didn't reply — here are a few others`,
      heading: `${q.vendor_name ?? "The vendor"} didn't reply in time`,
      lines: [
        `Your quote request for your ${(q.event_type ?? "event").toLowerCase()} on ${formatEventDate(q.event_date)} has expired.`,
        similar.length
          ? `Other ${q.service_type ? categoryPlural(q.service_type) : "vendors"} you could ask: ${similar
              .map((v) => `${v.name} (${formatAudDollars(v.hourly_rate)}/hr) ${SITE_URL}/vendor/${v.id}`)
              .join(" · ")}`
          : "Browse other vendors on Evntly and request a few more quotes.",
      ],
      cta: { label: "Find another vendor", path: q.service_type ? `/explore?category=${q.service_type}` : "/explore" },
    });
  }

  await Promise.all([
    stamp((vendorDue.data ?? []).map((q) => q.id), "vendor_reminder_sent_at"),
    stamp((clientDue.data ?? []).map((q) => q.id), "client_reminder_sent_at"),
    stamp((expiredDue.data ?? []).map((q) => q.id), "expiry_notice_sent_at"),
  ]);

  return NextResponse.json({
    vendorReminders: vendorDue.data?.length ?? 0,
    clientReminders: clientDue.data?.length ?? 0,
    expiryNotices: expiredDue.data?.length ?? 0,
  });
}
