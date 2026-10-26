"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPaymentGuardRejection, recordBlockedPayment } from "@/lib/payment-guard-log";
import { notify } from "@/lib/email";
import { conversationIdFor } from "@/lib/messages";
import { maskContactInfo } from "@/lib/contact-reveal";
import { messageRecipientEmail } from "@/lib/supabase/admin";
import {
  attachmentFolder,
  attachmentLabel,
  isAllowedAttachmentType,
  type Attachment,
} from "@/lib/attachments";
import { scanMessageAttachment } from "@/lib/attachment-scan";
import type { User } from "@supabase/supabase-js";
import { checkRateLimit, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { SAMPLE_LISTING_CONTACT_ERROR } from "@/lib/sample-listings";
import { friendlyLegalError } from "@/lib/legal/status";
import { getUnreadMessageCount } from "@/lib/data/user";

const MAX_MESSAGE_LENGTH = 5000;

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
    category: "messages",
    to,
    subject: `New message from ${sender}`,
    heading: `${sender} sent you a message`,
    lines: [],
    // Previews leave Evntly (email, push), so contact details are always
    // masked here; the thread shows them once there's a booking.
    quote: maskContactInfo(content),
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
  if (content.length > MAX_MESSAGE_LENGTH) return { error: "That message is too long." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "You need to be logged in to contact a vendor." };
  }
  if (!(await checkRateLimit("messageUser", user.id))) return { error: RATE_LIMIT_ERROR };

  // Recipients never come from the client: the fill_message_recipient
  // trigger addresses the message from the conversation id — the vendor's
  // owner from provider_id, the customer from their user id — and
  // fill_leakage_event_recipient does the same for blocked attempts.
  const { data: vendor } = await supabase
    .from("service_providers")
    .select("id, is_demo")
    .eq("id", vendorId)
    .eq("status", "approved")
    .maybeSingle();

  if (!vendor) return { error: "This vendor isn't accepting messages." };
  if (vendor.is_demo) return { error: SAMPLE_LISTING_CONTACT_ERROR };

  const conversationId = conversationIdFor(vendorId, user.id);

  const shouldEmail = !(await sentRecently(supabase, conversationId, user.id));

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_email: user.email,
      provider_id: vendorId,
      content,
      customer_initiated: true,
      // Unread until the recipient opens it (the badge counts read = false).
      read: false,
    })
    .select("id")
    .single();

  // Payment talk: blocked or just flagged depending on the DB guard mode.
  if (isPaymentGuardRejection(error)) {
    return recordBlockedPayment(supabase, { id: user.id, email: user.email }, conversationId, content);
  }
  if (error) return { error: friendlyLegalError(error.message) };

  if (shouldEmail) await notifyNewMessage(message.id, displayName(user), content, conversationId);

  revalidatePath("/messages");
  return { success: true };
}

// `attachment` is a file the browser already uploaded to the conversation's
// folder in storage (storage policies only let participants write there);
// the fill_message_recipient trigger re-checks the path and type.
export async function sendReply(
  conversationId: string,
  content: string,
  attachment?: Attachment
): Promise<SendMessageState> {
  const trimmed = content.trim();
  if (!trimmed && !attachment) return { error: "Write a message first." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { error: "That message is too long." };
  if (
    attachment &&
    (!attachment.path.startsWith(attachmentFolder(conversationId)) ||
      !isAllowedAttachmentType(attachment.type))
  ) {
    return { error: "That attachment can't be sent." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "You need to be logged in." };
  }
  if (!(await checkRateLimit("messageUser", user.id))) return { error: RATE_LIMIT_ERROR };

  // The conversation id is "<providerId>:<customerUserId>". An existing
  // message carries who started it; the first message of a conversation
  // (from a quote, booking or vendor page) works it out from the id. Either
  // way the database (fill_message_recipient) decides whether the caller may
  // write here: a participant, and for a first message a quote or booking
  // between them, or a customer writing to an approved listing.
  const [providerId, customerId, ...rest] = conversationId.split(":");
  if (!providerId || !customerId || rest.length > 0) return { error: "Conversation not found." };

  const { data: first } = await supabase
    .from("messages")
    .select("provider_id, customer_initiated")
    .eq("conversation_id", conversationId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const existing = first ?? { provider_id: providerId, customer_initiated: user.id === customerId };

  const shouldEmail = !(await sentRecently(supabase, conversationId, user.id));

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_email: user.email,
      provider_id: existing.provider_id,
      content: trimmed,
      customer_initiated: existing.customer_initiated,
      read: false,
      attachment_file_uri: attachment?.path ?? null,
      attachment_type: attachment?.type ?? null,
    })
    .select("id")
    .single();

  if (isPaymentGuardRejection(error)) {
    return recordBlockedPayment(supabase, { id: user.id, email: user.email }, conversationId, trimmed);
  }
  if (error) return { error: friendlyLegalError(error.message) };

  // Check the file for contact details after responding; until the scan
  // finishes the other party sees "checking attachment" instead of the file.
  if (attachment) after(() => scanMessageAttachment(message.id).then(() => undefined));

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
    await notifyNewMessage(
      message.id,
      sender,
      trimmed || `${attachmentLabel(attachment?.type)} attached`,
      conversationId
    );
  }

  // conversationId contains ":" and "@", which are percent-encoded in the
  // actual route (see the thread page's decodeURIComponent) — revalidatePath
  // needs the same encoded form to match the cached route, or this silently
  // no-ops and the new message won't show until a manual reload.
  revalidatePath(`/messages/${encodeURIComponent(conversationId)}`);
  revalidatePath("/messages");
  return { success: true };
}

// The header's unread badge re-checks this while the app is open, so a
// message that arrives on another page shows up without navigating.
export async function fetchUnreadMessageCount(): Promise<number> {
  return getUnreadMessageCount();
}
