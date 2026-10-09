"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addEventTask, toggleEventTask } from "@/lib/actions/event-tasks";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type EventTask = Database["public"]["Tables"]["event_tasks"]["Row"];

export function EventTaskList({ eventId, tasks }: { eventId: string; tasks: EventTask[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await addEventTask(eventId, title);
      if (!res?.error) {
        setTitle("");
        router.refresh();
      }
    });
  }

  function toggle(taskId: string, done: boolean) {
    startTransition(async () => {
      await toggleEventTask(taskId, done);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing on your run sheet yet.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={!!task.done}
                disabled={pending}
                onChange={(e) => toggle(task.id, e.target.checked)}
                className="size-4 shrink-0 rounded border-border accent-primary"
              />
              <span
                className={cn("text-sm", task.done && "text-muted-foreground line-through")}
              >
                {task.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button size="icon" variant="outline" disabled={pending || !title.trim()} onClick={add}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}
