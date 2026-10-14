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
