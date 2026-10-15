import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Service-role client, server-only (the key has no NEXT_PUBLIC_ prefix, so
// it never reaches the browser bundle). It bypasses RLS, so it's used only
// to address notifications and to serve the calendar feed.
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

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type PartyTable = "quote_requests" | "messages" | "bookings" | "event_applications";

// Stored emails are a snapshot from when the row was written and go stale if
// a user changes their account email; the *_user_id beside each one doesn't.
// Address notifications to the user's current account email, falling back
// to the stored one (demo vendors have no account).
async function partyEmails(
  admin: AdminClient,
  table: PartyTable,
  rowIds: string[],
  emailColumn: string
): Promise<string[]> {
  if (rowIds.length === 0) return [];
  const idColumn = emailColumn.replace(/_email$/, "_user_id");
  const { data } = await admin
    .from(table)
    .select(`${emailColumn}, ${idColumn}`)
    .in("id", rowIds);
  const rows = (data ?? []) as unknown as Record<string, string | null>[];
  const emails = await Promise.all(
    rows.map(async (row) => {
      const userId = row[idColumn];
      if (userId) {
        const { data: found } = await admin.auth.admin.getUserById(userId);
        if (found?.user?.email) return found.user.email;
      }
      return row[emailColumn];
    })
  );
  return emails.filter((email): email is string => !!email);
}

export async function quoteParticipantEmail(
  quoteId: string,
  who: "client_email" | "vendor_email"
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [email] = await partyEmails(admin, "quote_requests", [quoteId], who);
  return email ?? null;
}

export async function messageRecipientEmail(messageId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [email] = await partyEmails(admin, "messages", [messageId], "recipient_email");
  return email ?? null;
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
  const [email] = await partyEmails(admin, "bookings", [bookingId], who);
  return email ?? null;
}

/** Notification addresses for event applications (missing ones dropped). */
export async function applicationEmails(
  applicationIds: string[],
  who: "vendor_email" | "organiser_email"
): Promise<string[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  return partyEmails(admin, "event_applications", applicationIds, who);
}
