"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Truck, PackageCheck, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  markOnMyWay,
  markDelivered,
  confirmJobDelivery,
  addChecklistItem,
  toggleChecklistItem,
} from "@/lib/actions/job-cards";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type JobCard = Database["public"]["Tables"]["job_cards"]["Row"];
type ChecklistItem = Database["public"]["Tables"]["stage_checklist_items"]["Row"];

const STEPS = [
  { key: "scheduled", label: "Scheduled" },
  { key: "on_the_way", label: "On the way" },
  { key: "delivered", label: "Delivered" },
  { key: "confirmed", label: "Confirmed" },
];

export function JobCardPanel({
  jobCard,
  checklist,
  viewer,
}: {
  jobCard: JobCard;
  checklist: ChecklistItem[];
  viewer: "vendor" | "organiser";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newTask, setNewTask] = useState("");
  const stepIndex = STEPS.findIndex((s) => s.key === jobCard.status);

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function addTask() {
    if (!newTask.trim()) return;
    startTransition(async () => {
      await addChecklistItem(jobCard.id, jobCard.vendor_email, jobCard.organiser_email ?? "", newTask, viewer);
      setNewTask("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-xl bg-secondary p-3">
      <div className="mb-3 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center gap-1">
            <div
              className={cn(
                "flex h-6 flex-1 items-center justify-center rounded-full text-[11px] font-medium",
                i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
              )}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {viewer === "vendor" && jobCard.status === "scheduled" && (
          <Button size="sm" disabled={pending} onClick={() => act(() => markOnMyWay(jobCard.id))}>
            <Truck className="size-3.5" /> On my way
          </Button>
        )}
        {viewer === "vendor" && jobCard.status === "on_the_way" && (
          <Button size="sm" disabled={pending} onClick={() => act(() => markDelivered(jobCard.id))}>
            <PackageCheck className="size-3.5" /> Mark delivered
          </Button>
        )}
        {viewer === "organiser" && jobCard.status === "delivered" && (
          <Button size="sm" disabled={pending} onClick={() => act(() => confirmJobDelivery(jobCard.id))}>
            <ClipboardCheck className="size-3.5" /> Confirm it happened
          </Button>
        )}
        {jobCard.status === "confirmed" && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check className="size-4" /> Confirmed
          </span>
        )}
      </div>

      {checklist.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.status === "done"}
                disabled={pending}
                onChange={(e) => act(() => toggleChecklistItem(item.id, e.target.checked))}
              />
              <span className={item.status === "done" ? "text-muted-foreground line-through" : ""}>
                {item.label}
              </span>
              <span className="text-xs text-muted-foreground">({item.owner_role})</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <Input
          placeholder="Add a task…"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" disabled={pending || !newTask.trim()} onClick={addTask}>
          Add
        </Button>
      </div>
    </div>
  );
}
