import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/message-thread";
import { conversationIdFor, isLegacyConversationId } from "@/lib/messages";
import { maskContactInfo } from "@/lib/contact-reveal";
import { BlockUserButton, UnblockButton } from "@/components/block-user";

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
  const visibleMessages = booked
    ? messages
    : messages.map((m) => ({ ...m, content: maskContactInfo(m.content) }));

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
