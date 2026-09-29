"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { scanForLeakage } from "@/lib/leakage";

export type SendMessageState = { error?: string; success?: boolean } | null;

export async function sendVendorMessage(
  vendorId: string,
  vendorOwnerEmail: string,
  _prevState: SendMessageState,
  formData: FormData
): Promise<SendMessageState> {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "Write a message first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "You need to be logged in to contact a vendor." };
  }

  const conversationId = [vendorId, user.email].sort().join(":");

  // Anti-leakage: strip contact info before it ever reaches the recipient,
  // and log what was caught for admin review.
  const { redacted, matches, hasLeakage } = scanForLeakage(content);

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_email: user.email,
    recipient_email: vendorOwnerEmail,
    provider_id: vendorId,
    content: redacted,
    customer_initiated: true,
  });

  if (error) return { error: error.message };

  if (hasLeakage) {
    await supabase.from("leakage_events").insert(
      matches.map((m) => ({
        sender_id: user.id,
        sender_email: user.email,
        recipient_email: vendorOwnerEmail,
        conversation_id: conversationId,
        category: m.category,
        original_snippet: m.snippet,
        redacted_message: redacted,
      }))
    );
  }

  revalidatePath("/messages");
  return { success: true };
}
