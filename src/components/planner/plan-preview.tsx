"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Check, ListChecks, MessageSquareQuote } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EventOverview, coverCategory } from "@/components/planner/event-overview";
import { PlannerSheetContext } from "@/components/planner/planner-sheet";
import { PlannerTimeline } from "@/components/planner/planner-timeline";
import { IdeaCards } from "@/components/planner/idea-cards";
import { PrepChecklist } from "@/components/planner/prep-checklist";
import { buildChecklist, checklistProgress } from "@/lib/planner/checklist";
import { recommendVendors } from "@/lib/planner/recommendations";
import { buildTimeline, countdown } from "@/lib/planner/timeline";
import { DRAFT_STORAGE_KEY, readDraft, type PlanDraft } from "@/lib/planner/draft";
import { sydneyDate } from "@/lib/event-dates";
import { trackPlannerGuest } from "@/lib/track-client";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];

// After sign-up, /dashboard claims the draft (PlanClaimer) and opens the saved
// plan. The sign-up page words itself around saving a plan for this `next`.
export const SAVE_PLAN_NEXT = "/dashboard?from=plan";
const SIGNUP_HREF = `/signup?next=${encodeURIComponent(SAVE_PLAN_NEXT)}`;
const LOGIN_HREF = `/login?next=${encodeURIComponent(SAVE_PLAN_NEXT)}`;

/** A guest's plan, built in their browser. Anything that changes it asks them to save it first. */
export function PlanPreview({ approvedCounts }: { approvedCounts: Record<string, number> }) {
  const [draft, setDraft] = useState<PlanDraft | null | undefined>(undefined);
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    let saved: PlanDraft | null = null;
    try {
      saved = readDraft(localStorage.getItem(DRAFT_STORAGE_KEY))?.draft ?? null;
    } catch {
      saved = null;
    }
    // Reading browser storage has to wait until after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    if (saved) trackPlannerGuest("plan_previewed");
  }, []);

  const today = sydneyDate();
  const model = useMemo(() => (draft ? buildModel(draft, approvedCounts, today) : null), [draft, approvedCounts, today]);

  if (draft === undefined) return <div className="min-h-[60vh]" aria-busy="true" />;
  if (!draft || !model) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Start your plan</h1>
        <p className="mt-2 text-muted-foreground">Tell us what you&apos;re planning and when, and we&apos;ll build your timeline and checklist.</p>
        <Link href="/plan" className={cn(buttonVariants({ size: "lg" }), "btn-coral mt-6 h-12 px-6")}>
          Plan your event
        </Link>
      </div>
    );
  }

  const askToSave = () => setPrompt(true);
  const sheet = { openMenu: askToSave, openAdd: askToSave, openEdit: askToSave };

  return (
    <PlannerSheetContext.Provider value={sheet}>
      <div className="mx-auto max-w-2xl px-4 pt-3 pb-12 sm:pt-6 lg:max-w-3xl">
        <EventOverview
          event={model.event}
          cover={coverCategory(draft.eventType, [])}
          countdown={countdown(draft.eventDate, today)}
          progress={{ percent: model.tasks.percent, tasksDone: 0, tasksTotal: model.tasks.total, vendorsDone: 0, vendorsTotal: model.services.length }}
          settings={
            <Link href="/plan" className="btn-raised inline-flex h-11 items-center rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Edit
            </Link>
          }
        />

        <SaveCard onSave={() => trackPlannerGuest("plan_save_clicked")} />

        <section aria-labelledby="plan-heading" className="mb-10">
          <h2 id="plan-heading" className="mb-4 text-xl font-bold tracking-tight">
            Your plan
          </h2>
          <PlannerTimeline eventId="preview" groups={model.timeline} recommendations={model.next} ready preview />
        </section>

        <section aria-labelledby="ideas-heading" className="mb-10">
          <h2 id="ideas-heading" className="mb-4 text-xl font-bold tracking-tight">
            Vendors for your {draft.eventType.toLowerCase()}
          </h2>
          <IdeaCards eventId="preview" eventType={draft.eventType} ideas={[...model.next.map((r) => ({ ...r, title: r.title.replace(/^Find your/, "Explore") })), ...model.ideas]} preview />
        </section>

        <section aria-labelledby="prep-heading" className="mb-10">
          <h2 id="prep-heading" className="mb-1 text-xl font-bold tracking-tight">
            Before your event
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">{model.tasks.total} things to sort, each with a date that works back from your event.</p>
          <PrepChecklist eventId="preview" items={model.checklist} today={today} ready onLocked={askToSave} />
        </section>
      </div>
      <Sheet open={prompt} onOpenChange={setPrompt}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-lg gap-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-4 sm:rounded-[var(--radius-sheet)]">
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-foreground/15" />
          <SheetHeader className="px-1 pt-3 pb-2">
            <SheetTitle className="text-lg">Save your plan to keep going</SheetTitle>
            <SheetDescription>It&apos;s free. Everything you&apos;ve added comes with you.</SheetDescription>
          </SheetHeader>
          <SaveActions onSave={() => trackPlannerGuest("plan_save_clicked")} />
        </SheetContent>
      </Sheet>
    </PlannerSheetContext.Provider>
  );
}

const BENEFITS = [
  { icon: ListChecks, text: "Tick off your checklist and add your own tasks" },
  { icon: CalendarCheck2, text: "Build your schedule for the day" },
  { icon: MessageSquareQuote, text: "Request quotes and keep them in one place" },
];

function SaveActions({ onSave, benefits = true }: { onSave: () => void; benefits?: boolean }) {
  return (
    <div>
      {benefits && (
        <ul className="mb-4 space-y-2">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-[15px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-text">
                <Icon className="size-4" aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ul>
      )}
      <Link href={SIGNUP_HREF} onClick={onSave} className={cn(buttonVariants({ size: "lg" }), "btn-coral h-12 w-full text-base")}>
        Save my plan
      </Link>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={LOGIN_HREF} onClick={onSave} className="font-semibold text-foreground underline underline-offset-2">
          Log in
        </Link>
      </p>
    </div>
  );
}

function SaveCard({ onSave }: { onSave: () => void }) {
  return (
    <div className="my-4 rounded-card surface-raised p-4 sm:p-5">
      <p className="flex items-center gap-2 font-semibold">
        <Check className="size-4 text-success-text" aria-hidden /> Your plan is ready
      </p>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">Save it free to tick things off, add your schedule and get quotes from vendors.</p>
      <SaveActions onSave={onSave} benefits={false} />
    </div>
  );
}

function buildModel(draft: PlanDraft, approvedCounts: Record<string, number>, today: string) {
  const services = draft.requiredServices ?? [];
  const event = {
    id: "preview",
    // Same naming rule as the saved plan (eventTitle).
    name: draft.name?.trim() || null,
    event_type: draft.eventType,
    event_date: draft.eventDate,
    suburb: draft.suburb ?? "",
    guest_count: draft.guestCount ?? "",
    start_time: draft.startTime || null,
    end_time: draft.endTime || null,
    required_services: services,
  } as unknown as Event;
  const checklist = buildChecklist({ eventId: "preview", eventType: draft.eventType, eventDate: draft.eventDate, services, bookings: [], stored: [], today }).map((item) => ({
    ...item,
    // No saved event yet: booking tasks open search instead of the board.
    href: item.key.startsWith("book_") ? `/explore?category=${item.key.slice(5)}` : undefined,
  }));
  const timeline = buildTimeline({
    eventId: "preview",
    eventDate: draft.eventDate,
    startTime: draft.startTime || null,
    endTime: draft.endTime || null,
    rows: [],
    bookings: [],
    arrivals: new Map(),
    quotes: [],
    today,
  });
  const { next, ideas } = recommendVendors({
    eventType: draft.eventType,
    requiredServices: services,
    bookedServices: [],
    dismissed: [],
    approvedCounts: new Map(Object.entries(approvedCounts)),
    availableOnDate: new Map(),
  });
  return { event, services, checklist, tasks: checklistProgress(checklist), timeline, next, ideas };
}
