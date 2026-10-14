"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { scanForPaymentCircumvention, PAYMENT_GUARD_ERROR } from "@/lib/payment-guard";
import { notify } from "@/lib/email";
import { conversationIdFor } from "@/lib/messages";
import { messageRecipientEmail } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export type SendMessageState = { error?: string; success?: boolean } | null;

// One email per burst of messages, not one per message: if the sender already
// wrote in this conversation within the window, the recipient has (or soon
// will have) an email for it already.
const MESSAGE_EMAIL_COOLDOWN_MS = 10 * 60 * 1000;

async function sentRecently(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  senderId: string
) {
  // created_by is stamped with auth.uid() by the fill_message_recipient
  // trigger; sender_email isn't readable (or filterable) by users.
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("created_by", senderId)
    .gte("created_at", new Date(Date.now() - MESSAGE_EMAIL_COOLDOWN_MS).toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// Recipient addresses aren't readable by the sender, so look the address up
// server-side from the stored message (the DB trigger filled it in).
async function notifyNewMessage(
  messageId: string,
  sender: string,
  content: string,
  conversationId: string
) {
  const to = await messageRecipientEmail(messageId);
  if (!to) return;
  notify({
    to,
    subject: `New message from ${sender}`,
    heading: `${sender} sent you a message`,
    lines: [],
    quote: content,
    cta: { label: "Reply on Evntly", path: `/messages/${encodeURIComponent(conversationId)}` },
  });
}

function displayName(user: User) {
  return (user.user_metadata?.full_name as string | undefined)?.trim() || "An Evntly customer";
}

export async function sendVendorMessage(
  vendorId: string,
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

  // Recipients never come from the client: the fill_message_recipient
  // trigger addresses the message from the conversation id — the vendor's
  // owner from provider_id, the customer from their user id — and
  // fill_leakage_event_recipient does the same for blocked attempts.
  const { data: vendor } = await supabase
    .from("service_providers")
    .select("id")
    .eq("id", vendorId)
    .eq("status", "approved")
    .maybeSingle();

  if (!vendor) return { error: "This vendor isn't accepting messages." };

  const conversationId = conversationIdFor(vendorId, user.id);

  const guard = scanForPaymentCircumvention(content);
  if (guard.blocked) {
    await supabase.from("leakage_events").insert({
      sender_id: user.id,
      sender_email: user.email,
      conversation_id: conversationId,
      category: guard.category,
      original_snippet: guard.snippet,
      redacted_message: null,
    });
    return { error: PAYMENT_GUARD_ERROR };
  }

  const shouldEmail = !(await sentRecently(supabase, conversationId, user.id));

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_email: user.email,
      provider_id: vendorId,
      content,
      customer_initiated: true,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (shouldEmail) await notifyNewMessage(message.id, displayName(user), content, conversationId);

  revalidatePath("/messages");
  return { success: true };
}

export async function sendReply(
  conversationId: string,
  content: string
): Promise<SendMessageState> {
  const trimmed = content.trim();
  if (!trimmed) return { error: "Write a message first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "You need to be logged in." };
  }

  // RLS only returns rows from conversations the caller is part of, so an
  // empty result covers both "doesn't exist" and "not yours".
  const { data: existing } = await supabase
    .from("messages")
    .select("provider_id, customer_initiated")
    .eq("conversation_id", conversationId)
    .limit(1)
    .maybeSingle();

  if (!existing) return { error: "Conversation not found." };

  const guard = scanForPaymentCircumvention(trimmed);
  if (guard.blocked) {
    await supabase.from("leakage_events").insert({
      sender_id: user.id,
      sender_email: user.email,
      conversation_id: conversationId,
      category: guard.category,
      original_snippet: guard.snippet,
      redacted_message: null,
    });
    return { error: PAYMENT_GUARD_ERROR };
  }

  const shouldEmail = !(await sentRecently(supabase, conversationId, user.id));

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_email: user.email,
      provider_id: existing.provider_id,
      content: trimmed,
      customer_initiated: existing.customer_initiated,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (shouldEmail) {
    // The vendor side replies as their business, the customer side by name.
    // A vendor's conversation id starts with their own listing id.
    let sender = displayName(user);
    if (existing.provider_id) {
      const { data: ownListing } = await supabase
        .rpc("my_service_providers")
        .select("name")
        .eq("id", existing.provider_id)
        .maybeSingle();
      if (ownListing?.name) sender = ownListing.name;
    }
    await notifyNewMessage(message.id, sender, trimmed, conversationId);
  }

  // conversationId contains ":" and "@", which are percent-encoded in the
  // actual route (see the thread page's decodeURIComponent) — revalidatePath
  // needs the same encoded form to match the cached route, or this silently
  // no-ops and the new message won't show until a manual reload.
  revalidatePath(`/messages/${encodeURIComponent(conversationId)}`);
  revalidatePath("/messages");
  return { success: true };
}
