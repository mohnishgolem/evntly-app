import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { CAMPAIGN_COOKIE, isCampaignTag, isFoundingSource, SOURCE_COOKIE, type FoundingSource } from "@/lib/founding/sources";

// Founding Vendor conversion events (table public.funnel_events). Nothing
// personal is stored: the event, which founding link the visitor came from,
// a short error code, and at most the random per-browser visitor id that
// page_views already uses. Recording must never break the flow it measures.

export const FUNNEL_EVENTS = ["claim_click", "signup_attempt", "signup_error", "account_created"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Events the browser may send to /api/track. The rest are server-only. */
export const CLIENT_FUNNEL_EVENTS: readonly FunnelEvent[] = ["claim_click", "signup_attempt"];

export function isFunnelEvent(value: unknown): value is FunnelEvent {
  return FUNNEL_EVENTS.includes(value as FunnelEvent);
}

/** Error codes are stored only when they look like a code ("weak_password"). */
export function funnelDetail(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_]{1,40}$/.test(value) ? value : null;
}

/** The founding source remembered by <SourceCookie>, if any. */
export async function foundingSourceFromCookie(): Promise<FoundingSource | null> {
  try {
    const value = (await cookies()).get(SOURCE_COOKIE)?.value;
    return isFoundingSource(value) ? value : null;
  } catch {
    return null;
  }
}

/** The post/link campaign tag remembered by <SourceCookie>, if any. */
export async function foundingCampaignFromCookie(): Promise<string | null> {
  try {
    const value = (await cookies()).get(CAMPAIGN_COOKIE)?.value;
    return isCampaignTag(value) ? value : null;
  } catch {
    return null;
  }
}

export async function recordFunnelEvent(
  event: FunnelEvent,
  opts: { source?: FoundingSource | null; detail?: string | null; visitorId?: string | null } = {}
): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const source = opts.source === undefined ? await foundingSourceFromCookie() : opts.source;
    const campaign = await foundingCampaignFromCookie();
    await admin.from("funnel_events").insert({
      event,
      source,
      // Only sent when there is one, so events keep recording if this code is
      // ever live before the funnel_events.campaign migration.
      ...(campaign ? { campaign } : {}),
      detail: funnelDetail(opts.detail),
      visitor_id: opts.visitorId && /^[A-Za-z0-9-]{8,64}$/.test(opts.visitorId) ? opts.visitorId : null,
    });
  } catch (e) {
    console.error("[funnel] could not record", event, e instanceof Error ? e.message : e);
  }
}
