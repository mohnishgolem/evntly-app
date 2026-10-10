"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { scanForPaymentCircumvention, PAYMENT_GUARD_ERROR } from "@/lib/payment-guard";

export type ActionState = { error?: string; success?: boolean } | null;

export async function sendGroupMessage(threadId: string, content: string): Promise<ActionState> {
  const trimmed = content.trim();
  if (!trimmed) return { error: "Write a message first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data: thread } = await supabase
    .from("group_chat_threads")
    .select("participant_emails")
    .eq("id", threadId)
    .single();
  if (!thread) return { error: "Conversation not found." };

  const guard = scanForPaymentCircumvention(trimmed);
  if (guard.blocked) {
    await supabase.from("leakage_events").insert({
      sender_id: user.id,
      sender_email: user.email,
      conversation_id: threadId,
      category: guard.category,
      original_snippet: guard.snippet,
      redacted_message: null,
    });
    return { error: PAYMENT_GUARD_ERROR };
  }

  const { error } = await supabase.from("group_chat_messages").insert({
    thread_id: threadId,
    sender_email: user.email,
    sender_name: user.user_metadata?.full_name ?? null,
    content: trimmed,
    participant_emails: thread.participant_emails,
  });
  if (error) return { error: error.message };

  revalidatePath(`/messages/group/${threadId}`);
  return { success: true };
}
