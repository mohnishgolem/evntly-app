import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export default async function MessagesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/messages");

  const email = session.user.email as string;
  const supabase = await createClient();
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_email.eq.${email},recipient_email.eq.${email}`)
    .order("created_at", { ascending: false });

  const threads = new Map<string, MessageRow>();
  for (const m of messages ?? []) {
    if (!threads.has(m.conversation_id)) threads.set(m.conversation_id, m);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Messages</h1>
      {threads.size === 0 ? (
        <p className="text-sm text-muted-foreground">No conversations yet.</p>
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border">
          {[...threads.values()].map((m) => {
            const counterpart = m.sender_email === email ? m.recipient_email : m.sender_email;
            return (
              <div key={m.conversation_id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{counterpart}</span>
                  {!m.read && m.recipient_email === email && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{m.content}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
