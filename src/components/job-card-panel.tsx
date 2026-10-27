"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Truck, PackageCheck, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sydneyDate } from "@/lib/event-dates";
import {
  markOnMyWay,
  markDelivered,
  confirmJobDelivery,
  addChecklistItem,
  toggleChecklistItem,
} from "@/lib/actions/job-cards";
import { cn } from "@/lib/utils";
import type { ParticipantChecklistItem, ParticipantJobCard } from "@/lib/public-columns";

type JobCard = ParticipantJobCard;
type ChecklistItem = ParticipantChecklistItem;

function formatDay(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

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
  const [error, setError] = useState<string | null>(null);
  const stepIndex = STEPS.findIndex((s) => s.key === jobCard.status);
  // The job can be marked done from the event day (Sydney time); the
  // database enforces the same rule.
  const eventReached = jobCard.event_date <= sydneyDate();
  const notStarted = jobCard.status === "scheduled" || jobCard.status === "on_the_way";

  function act(fn: () => Promise<{ error?: string } | null>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      router.refresh();
    });
  }

  function addTask() {
    if (!newTask.trim()) return;
    startTransition(async () => {
      await addChecklistItem(jobCard.id, newTask, viewer);
      setNewTask("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-xl bg-secondary p-3">
      {/* A read-only tracker — the steps are taken with the buttons below. */}
      <div className="mb-3">
        <p className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium tracking-wide uppercase">Progress</span>
          <span>
            Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex]?.label}
          </span>
        </p>
        <ol aria-label="Job progress" className="grid grid-cols-4 gap-1">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <div
                aria-hidden
                className={cn("h-1.5 rounded-full", i <= stepIndex ? "bg-primary" : "bg-muted-foreground/20")}
              />
              <span
                className={cn(
                  "mt-1 block text-[11px]",
                  i === stepIndex ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
                <span className="sr-only">
                  {i < stepIndex ? " (done)" : i === stepIndex ? " (current step)" : " (not yet)"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {viewer === "vendor" && jobCard.status === "scheduled" && (
          <Button size="sm" disabled={pending} onClick={() => act(() => markOnMyWay(jobCard.id))}>
            <Truck className="size-3.5" /> On my way
          </Button>
        )}
        {viewer === "vendor" && notStarted && eventReached && (
          <ConfirmStep
            pending={pending}
            trigger={
              <>
                <PackageCheck className="size-3.5" /> Mark job done
              </>
            }
            title="Mark this job as done?"
            description="Your customer will be asked to confirm everything went as agreed. The booking is completed once they confirm."
            confirmLabel="Mark job done"
            onConfirm={() => act(() => markDelivered(jobCard.id))}
          />
        )}
        {viewer === "vendor" && notStarted && !eventReached && (
          <p className="text-sm text-muted-foreground">
            Next: mark the job done on the event day, {formatDay(jobCard.event_date)}.
          </p>
        )}
        {viewer === "vendor" && jobCard.status === "delivered" && (
          <p className="text-sm text-muted-foreground">Next: waiting for the customer to confirm.</p>
        )}
        {viewer === "organiser" && jobCard.status === "delivered" && (
          <ConfirmStep
            pending={pending}
            trigger={
              <>
                <ClipboardCheck className="size-3.5" /> Confirm booking complete
              </>
            }
            title="Confirm the booking is complete?"
            description="Only confirm if the job went as agreed. This completes the booking and can't be undone. If something went wrong, open a problem report instead."
            confirmLabel="Confirm complete"
            onConfirm={() => act(() => confirmJobDelivery(jobCard.id))}
          />
        )}
        {viewer === "organiser" && notStarted && (
          <p className="text-sm text-muted-foreground">
            Next: after the event, your vendor marks the job done and you&apos;ll confirm it here.
          </p>
        )}
        {jobCard.status === "confirmed" && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" /> Confirmed
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

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

function ConfirmStep({
  pending,
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  pending: boolean;
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" disabled={pending} />}>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Not yet
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
