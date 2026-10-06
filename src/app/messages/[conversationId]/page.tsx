import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/message-thread";
import { counterpartDisplayName } from "@/lib/messages";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/messages");

  const { conversationId } = await params;
  const email = session.user.email as string;
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (!messages || messages.length === 0) notFound();

  const first = messages[0];
  if (first.sender_email !== email && first.recipient_email !== email) notFound();

  const counterpartEmail =
    first.sender_email === email ? first.recipient_email : first.sender_email;

  let provider: { name: string; owner_email: string | null } | null = null;
  if (first.provider_id) {
    const { data } = await supabase
      .from("service_providers")
      .select("name, owner_email")
      .eq("id", first.provider_id)
      .maybeSingle();
    provider = data;
  }

  const unreadIds = messages
    .filter((m) => !m.read && m.recipient_email === email)
    .map((m) => m.id);
  if (unreadIds.length > 0) {
    await supabase.from("messages").update({ read: true }).in("id", unreadIds);
  }

  const counterpartName = counterpartDisplayName(counterpartEmail, provider);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/messages"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Messages
      </Link>
      <h1 className="mb-6 text-2xl font-bold">{counterpartName}</h1>
      <MessageThread
        conversationId={conversationId}
        messages={messages}
        selfEmail={email}
        counterpartName={counterpartName}
      />
    </div>
  );
}
