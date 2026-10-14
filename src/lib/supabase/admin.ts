import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Service-role client, server-only (the key has no NEXT_PUBLIC_ prefix, so
// it never reaches the browser bundle). It bypasses RLS, so it's used for
// exactly one thing: looking up the email address to send a notification to.
// Users can't read each other's emails on quote_requests/messages (column
// SELECT is revoked), so server actions running as the user can't either.
function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY is not set — skipping notification email.");
    return null;
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function quoteParticipantEmail(
  quoteId: string,
  who: "client_email" | "vendor_email"
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("quote_requests").select(who).eq("id", quoteId).maybeSingle();
  return (data as Record<string, string> | null)?.[who] ?? null;
}

export async function messageRecipientEmail(messageId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("messages")
    .select("recipient_email")
    .eq("id", messageId)
    .maybeSingle();
  return data?.recipient_email ?? null;
}

// Calendar feed (/calendar-feed/<token>.ics): calendar apps fetch it with no
// session, so the token is resolved to its owner here. Returns null for an
// unknown token. Only the owner's own bookings as a vendor are included.
export async function calendarFeedForToken(token: string) {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: feed } = await admin
    .from("calendar_feed_tokens")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();
  if (!feed) return null;

  // A year of history plus everything ahead keeps the feed small.
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, updated_at, event_date, event_time, duration_hours, status, client_label, provider_name, event_address"
    )
    .eq("provider_owner_user_id", feed.user_id)
    .in("status", ["pending", "confirmed", "completed"])
    .gte("event_date", since)
    .order("event_date", { ascending: true });

  return { bookings: bookings ?? [] };
}

export async function bookingParticipantEmail(
  bookingId: string,
  who: "client_email" | "provider_owner_email"
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("bookings").select(who).eq("id", bookingId).maybeSingle();
  return (data as Record<string, string | null> | null)?.[who] ?? null;
}
