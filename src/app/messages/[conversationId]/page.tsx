import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/message-thread";
import { conversationIdFor, isLegacyConversationId } from "@/lib/messages";
import { maskContactInfo } from "@/lib/contact-reveal";
import { BlockUserButton, UnblockButton } from "@/components/block-user";
import { ATTACHMENT_BUCKET } from "@/lib/attachments";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/messages");

  const { conversationId: rawConversationId } = await params;
  const conversationId = decodeURIComponent(rawConversationId);

  // Links in older notification emails used "<vendorId>:<customerEmail>".
  // The customer can be sent to the new id; a vendor can't map an email to a
  // user id (by design), so they land on the inbox instead.
  if (isLegacyConversationId(conversationId)) {
    const parts = conversationId.split(":");
    const emailPart = parts.find((p) => p.includes("@"));
    const providerPart = parts.find((p) => !p.includes("@"));
    if (providerPart && emailPart === session.user.email) {
      redirect(`/messages/${encodeURIComponent(conversationIdFor(providerPart, session.user.id))}`);
    }
    redirect("/messages");
  }

  const supabase = await createClient();
  const [{ data: messages }, { data: thread }, { data: blockState }] = await Promise.all([
    supabase.rpc("conversation_messages", { p_conversation_id: conversationId }),
    supabase.rpc("my_conversations").eq("conversation_id", conversationId).maybeSingle(),
    supabase.rpc("conversation_block_state", { p_conversation_id: conversationId }),
  ]);

  // Both RPCs only return the caller's own conversations.
  if (!messages || messages.length === 0 || !thread) notFound();

  const unreadIds = messages.filter((m) => !m.read && !m.from_me).map((m) => m.id);
  if (unreadIds.length > 0) {
    await supabase.from("messages").update({ read: true }).in("id", unreadIds);
  }

  // Contact info stays masked until this vendor/customer pair has a real
  // booking behind them — same stored message, it just renders unmasked
  // once that's true, no need to touch anything already sent.
  const booked = thread.booked;
  const counterpartName = thread.counterpart_name;
  // Attachments are private: sign short-lived URLs as the viewer (the
  // storage read policy only allows the conversation's participants).
  const attachmentPaths = messages
    .map((m) => m.attachment_file_uri)
    .filter((p): p is string => !!p);
  const signedUrls = new Map<string, string>();
  if (attachmentPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(attachmentPaths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedUrls.set(s.path, s.signedUrl);
    }
  }

  // Attachments are scanned for contact details; until there's a booking the
  // recipient can't open one that's still being checked or that contains
  // contact details (storage refuses it too). The sender always sees theirs.
  const visibleMessages = messages.map((m) => {
    const scan = m.attachment_scan;
    const held = !booked && (scan === "pending" || scan === "contact");
    return {
      ...m,
      content: booked ? m.content : maskContactInfo(m.content),
      attachmentUrl:
        m.attachment_file_uri && !(held && !m.from_me)
          ? (signedUrls.get(m.attachment_file_uri) ?? null)
          : null,
      attachmentHeld: held ? (scan as "pending" | "contact") : null,
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/messages"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Messages
      </Link>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{counterpartName}</h1>
        {blockState === "none" && (
          <BlockUserButton name={counterpartName} conversationId={conversationId} />
        )}
      </div>
      {blockState === "i_blocked" && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary px-4 py-3 text-sm">
          <p>
            You blocked {counterpartName}. Neither of you can send messages here, and they
            can&apos;t request quotes from you.
          </p>
          <UnblockButton conversationId={conversationId} />
        </div>
      )}
      {!booked && blockState === "none" && (
        <p className="mb-4 text-sm text-muted-foreground">
          Phone numbers, emails, and social handles are hidden here until this booking is
          confirmed.
        </p>
      )}
      <MessageThread
        conversationId={conversationId}
        messages={visibleMessages}
        counterpartName={counterpartName}
        closedReason={
          blockState === "i_blocked"
            ? "Unblock to send messages."
            : blockState === "blocked_me"
              ? "You can't reply to this conversation."
              : undefined
        }
      />
    </div>
  );
}
