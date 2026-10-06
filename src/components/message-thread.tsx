"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendReply } from "@/lib/actions/messages";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type Message = Database["public"]["Tables"]["messages"]["Row"];

export function MessageThread({
  conversationId,
  messages,
  selfEmail,
  counterpartName,
}: {
  conversationId: string;
  messages: Message[];
  selfEmail: string;
  counterpartName: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await sendReply(conversationId, content);
      if (res?.error) {
        setError(res.error);
      } else {
        setContent("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-border">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Say hello to {counterpartName}.
          </p>
        ) : (
          messages.map((m) => {
            const isSelf = m.sender_email === selfEmail;
            return (
              <div key={m.id} className={cn("flex flex-col", isSelf ? "items-end" : "items-start")}>
                <span className="mb-0.5 text-xs text-muted-foreground">
                  {isSelf ? "You" : counterpartName}
                </span>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    isSelf ? "bg-primary text-primary-foreground" : "bg-secondary"
                  )}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
      </div>
      <form action={submit} className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          rows={1}
          placeholder={`Message ${counterpartName}…`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="min-h-9 flex-1 resize-none"
        />
        <Button type="submit" size="icon" disabled={pending || !content.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
      {error && <p className="px-3 pb-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
