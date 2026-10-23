import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Conversation ids the signed-in user is part of. A conversation page 404s
 * until it has a message, so quotes, leads and bookings only link to a
 * thread that exists.
 */
export const getMyConversationIds = cache(async function getMyConversationIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_conversations");
  return (data ?? []).map((c) => c.conversation_id);
});
