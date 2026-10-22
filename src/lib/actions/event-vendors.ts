"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestQuote } from "@/lib/actions/quotes";
import { loadMatchingSettings, matchEventCategories } from "@/lib/data/matching";
import { eventHours, type ExclusionCode, type MatchVendor } from "@/lib/matching/engine";
import { effectiveQuoteStatus } from "@/lib/quote-expiry";
import { PUBLIC_VENDOR_COLUMNS } from "@/lib/vendor-columns";

export type InviteResult = {
  error?: string;
  success?: boolean;
  sent?: number;
  /** Vendors not invited, and why — shown to the customer. */
  skipped?: { name: string; reason: string }[];
};

/** At most this many open quote requests per category per event (also a DB rule). */
const MAX_OPEN_REQUESTS = 5;

// Stage A failures that mean the vendor can't do the job at all. Softer ones
// (over the estimate, outside their usual area) don't stop a customer asking —
// the vendor decides — but the request isn't marked as a smart match.
const HARD_EXCLUSIONS: ExclusionCode[] = ["not_approved", "sample_listing", "paused", "date_blocked", "day_off", "booked"];

// events.guest_count is a free-text bucket label ("Under 80"), but
// quote_requests.estimated_guests is a required integer — translate to a
// reasonable representative number rather than leaving it unset.
function estimateGuestCount(bucket: string | null): number {
  if (!bucket) return 50;
  if (bucket.toLowerCase().includes("under")) return 50;
  if (bucket.toLowerCase().includes("over")) return 200;
  return 100;
}

const idsSchema = z.array(z.string().min(1).max(100)).min(1, "Select at least one vendor.").max(MAX_OPEN_REQUESTS, `Choose up to ${MAX_OPEN_REQUESTS} vendors.`);

/**
 * Invite up to five vendors to quote on an event. Everything is re-checked
 * here rather than trusted from the board: the event must be the caller's,
 * each vendor is re-matched server-side (score and reason come from this run,
 * never the browser), vendors already asked are skipped, and the per-category
 * cap counts requests already open. The database enforces the cap, the
 * duplicate rule and event ownership again.
 */
export async function requestQuotesForEvent(eventId: string, vendorIds: string[]): Promise<InviteResult> {
  const parsedIds = idsSchema.safeParse(Array.isArray(vendorIds) ? [...new Set(vendorIds)] : vendorIds);
  if (!parsedIds.success) return { error: parsedIds.error.issues[0]?.message ?? "Select at least one vendor." };
  const ids = parsedIds.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("organiser_user_id", user.id)
    .maybeSingle();
  if (!event) return { error: "Not your event." };

  const { data: picked } = await supabase
    .from("service_providers")
    .select(PUBLIC_VENDOR_COLUMNS)
    .in("id", ids)
    .eq("status", "approved");
  if (!picked?.length) return { error: "Those vendors aren't available." };

  // Re-match against the same candidate pool the board uses, so widening and
  // scores agree with what the customer saw.
  const services = [...new Set(picked.map((v) => v.service_type))].filter((s) => event.required_services.includes(s));
  const [settings, candidatesRes, existingRes] = await Promise.all([
    loadMatchingSettings(supabase),
    services.length
      ? supabase.from("service_providers").select(PUBLIC_VENDOR_COLUMNS).eq("status", "approved").in("service_type", services).limit(400)
      : Promise.resolve({ data: [] }),
    supabase
      .from("quote_requests")
      .select("vendor_id, service_type, status, expires_at")
      .eq("event_id", eventId)
      .eq("client_user_id", user.id),
  ]);
  const candidates = (candidatesRes.data ?? []) as MatchVendor[];
  const { matches } = await matchEventCategories(supabase, { ...event, required_services: services }, candidates, settings);

  const open = (existingRes.data ?? []).filter((q) => {
    const s = effectiveQuoteStatus(q);
    return s === "pending" || s === "quoted";
  });
  const openByService = new Map<string, number>();
  for (const q of open) if (q.service_type) openByService.set(q.service_type, (openByService.get(q.service_type) ?? 0) + 1);
  const alreadyAsked = new Set(open.map((q) => q.vendor_id));

  const skipped: { name: string; reason: string }[] = [];
  const toSend: { id: string; name: string; score: number | null; reason: string | null }[] = [];
  for (const v of picked) {
    if (!event.required_services.includes(v.service_type)) {
      skipped.push({ name: v.name, reason: "Not a vendor type this event needs" });
      continue;
    }
    if (alreadyAsked.has(v.id)) {
      skipped.push({ name: v.name, reason: "Already asked for a quote" });
      continue;
    }
    const m = matches.get(v.service_type);
    const scored = m ? [...m.eligible, ...m.unconfirmed].find((s) => s.vendorId === v.id) : undefined;
    const excluded = m?.excluded.find((e) => e.vendorId === v.id);
    const hard = excluded?.exclusions.find((x) => HARD_EXCLUSIONS.includes(x.code));
    if (hard) {
      skipped.push({ name: v.name, reason: hard.message });
      continue;
    }
    const openCount = openByService.get(v.service_type) ?? 0;
    if (openCount >= MAX_OPEN_REQUESTS) {
      skipped.push({ name: v.name, reason: `You already have ${MAX_OPEN_REQUESTS} open requests for this vendor type` });
      continue;
    }
    openByService.set(v.service_type, openCount + 1);
    toSend.push({ id: v.id, name: v.name, score: scored?.score ?? null, reason: scored?.reason ?? null });
  }

  const hours = eventHours(event.start_time, event.end_time);
  const draft = {
    eventDate: event.event_date,
    eventType: event.event_type,
    location: event.suburb,
    estimatedGuests: estimateGuestCount(event.guest_count),
    estimatedHours: hours ?? undefined,
    budgetRange: event.budget_total ? `$${Number(event.budget_total).toLocaleString("en-AU")}` : "Flexible",
    details: event.notes || undefined,
  };

  // Sequential, so the per-hour limit and DB cap see each insert in order.
  let sent = 0;
  for (const v of toSend) {
    const res = await requestQuote(v.id, draft, eventId, {
      origin: v.score != null ? "smart_match" : "event_board",
      matchScore: v.score,
    });
    if (res?.error || !res?.quoteId) {
      skipped.push({ name: v.name, reason: res?.error ?? "Couldn't send" });
      continue;
    }
    sent++;
    if (v.score != null) await recordMatch(res.quoteId, v.score, v.reason);
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  if (sent === 0) return { error: skipped[0]?.reason ?? "Couldn't send any quote requests.", skipped };
  return { success: true, sent, skipped };
}

/**
 * The score and reason shown to the vendor are written with the service-role
 * client: the database refuses them from customers and vendors, so neither
 * side can inflate a match.
 */
async function recordMatch(quoteId: string, score: number, reason: string | null) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    await admin
      .from("quote_requests")
      .update({ match_score: Math.max(0, Math.min(100, Math.round(score))), match_reason: reason?.slice(0, 500) ?? null })
      .eq("id", quoteId);
  } catch (err) {
    // The invitation is already sent; a missing score only hides a badge.
    console.error("recordMatch failed", err);
  }
}
