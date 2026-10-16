"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPaymentGuardRejection, recordBlockedPayment } from "@/lib/payment-guard-log";

export type ActionState = { error?: string; success?: boolean } | null;

export async function sendGroupMessage(threadId: string, content: string): Promise<ActionState> {
  const trimmed = content.trim();
  if (!trimmed) return { error: "Write a message first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  // RLS only returns threads the caller belongs to.
  const { data: thread } = await supabase
    .from("group_chat_threads")
    .select("id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return { error: "Conversation not found." };

  const { error } = await supabase.from("group_chat_messages").insert({
    thread_id: threadId,
    sender_email: user.email,
    sender_name: user.user_metadata?.full_name ?? null,
    content: trimmed,
    // participant_emails comes from the thread (fill_group_message_participants).
  });
  // Payment talk: blocked or just flagged depending on the DB guard mode.
  if (isPaymentGuardRejection(error)) {
    return recordBlockedPayment(supabase, { id: user.id, email: user.email }, threadId, trimmed);
  }
  if (error) return { error: error.message };

  revalidatePath(`/messages/group/${threadId}`);
  return { success: true };
}
