"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { scanForPaymentCircumvention, PAYMENT_GUARD_ERROR } from "@/lib/payment-guard";
import { notify } from "@/lib/email";
import { conversationCustomerEmail } from "@/lib/messages";
import type { User } from "@supabase/supabase-js";

export type SendMessageState = { error?: string; success?: boolean } | null;

// One email per burst of messages, not one per message: if the sender already
// wrote in this conversation within the window, the recipient has (or soon
// will have) an email for it already.
const MESSAGE_EMAIL_COOLDOWN_MS = 10 * 60 * 1000;

async function sentRecently(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  senderEmail: string
) {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("sender_email", senderEmail)
    .gte("created_at", new Date(Date.now() - MESSAGE_EMAIL_COOLDOWN_MS).toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

function notifyNewMessage(to: string, sender: string, content: string, conversationId: string) {
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

  // The vendor's email isn't publicly readable, and never comes from the
  // client: the fill_message_recipient trigger addresses the message to the
  // vendor's real owner from provider_id (and fill_leakage_event_recipient
  // does the same for blocked attempts, from the conversation id).
  const { data: vendor } = await supabase
    .from("service_providers")
    .select("id")
    .eq("id", vendorId)
    .eq("status", "approved")
    .maybeSingle();

  if (!vendor) return { error: "This vendor isn't accepting messages." };

  const conversationId = [vendorId, user.email].sort().join(":");

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

  const shouldEmail = !(await sentRecently(supabase, conversationId, user.email));

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_email: user.email,
      provider_id: vendorId,
      content,
      customer_initiated: true,
    })
    .select("recipient_email")
    .single();

  if (error) return { error: error.message };

  if (shouldEmail) notifyNewMessage(message.recipient_email, displayName(user), content, conversationId);

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

  const { data: existing } = await supabase
    .from("messages")
    .select("sender_email, recipient_email, provider_id, customer_initiated")
    .eq("conversation_id", conversationId)
    .limit(1)
    .maybeSingle();

  if (!existing) return { error: "Conversation not found." };
  if (user.email !== existing.sender_email && user.email !== existing.recipient_email) {
    return { error: "You don't have access to this conversation." };
  }

  const counterpart =
    existing.sender_email === user.email ? existing.recipient_email : existing.sender_email;

  const guard = scanForPaymentCircumvention(trimmed);
  if (guard.blocked) {
    await supabase.from("leakage_events").insert({
      sender_id: user.id,
      sender_email: user.email,
      recipient_email: counterpart,
      conversation_id: conversationId,
      category: guard.category,
      original_snippet: guard.snippet,
      redacted_message: null,
    });
    return { error: PAYMENT_GUARD_ERROR };
  }

  const shouldEmail = !(await sentRecently(supabase, conversationId, user.email));

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_email: user.email,
    recipient_email: counterpart,
    provider_id: existing.provider_id,
    content: trimmed,
    customer_initiated: existing.customer_initiated,
  });

  if (error) return { error: error.message };

  if (shouldEmail) {
    // The vendor side replies as their business, the customer side by name.
    const customerEmail = conversationCustomerEmail(conversationId);
    let sender = displayName(user);
    if (existing.provider_id && user.email !== customerEmail) {
      const { data: vendor } = await supabase
        .from("service_providers")
        .select("name")
        .eq("id", existing.provider_id)
        .maybeSingle();
      if (vendor?.name) sender = vendor.name;
    }
    notifyNewMessage(counterpart, sender, trimmed, conversationId);
  }

  // conversationId contains ":" and "@", which are percent-encoded in the
  // actual route (see the thread page's decodeURIComponent) — revalidatePath
  // needs the same encoded form to match the cached route, or this silently
  // no-ops and the new message won't show until a manual reload.
  revalidatePath(`/messages/${encodeURIComponent(conversationId)}`);
  revalidatePath("/messages");
  return { success: true };
}
