import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { GroupChat } from "@/components/group-chat";

export default async function GroupChatPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const { threadId } = await params;
  const supabase = await createClient();
  const [{ data: thread }, { data: messages }] = await Promise.all([
    supabase.from("group_chat_threads").select("*").eq("id", threadId).maybeSingle(),
    supabase
      .from("group_chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);

  if (!thread) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">{thread.combined_package_name ?? "Group chat"}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {thread.participant_emails.length} people in this conversation.
      </p>
      <GroupChat
        threadId={threadId}
        messages={messages ?? []}
        selfEmail={session.user.email as string}
      />
    </div>
  );
}
