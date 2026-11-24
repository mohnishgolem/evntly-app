"use client";

import { groupDigits } from "@/lib/founding/schedule";
import { earliestEventDate } from "@/lib/event-dates";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CategoryArt } from "@/components/category-art";
import { cn } from "@/lib/utils";
import { EVENT_TYPES, GUEST_BUCKETS, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { claimEventPlan } from "@/lib/actions/events";
import { publishEventToFeed } from "@/lib/actions/event-feed";
import { formatEventTimes, NOT_LOGGED_IN } from "@/lib/event-times";
import { DRAFT_STORAGE_KEY, defaultEventName, missingForPlan, readDraft, type PlanDraft } from "@/lib/planner/draft";
import { trackPlannerGuest } from "@/lib/track-client";

const BUDGET_MIN = 500;
const BUDGET_MAX = 30000;

type Draft = Required<Omit<PlanDraft, "notes">> & { notes: string };

// Two questions make a plan: what and when. Everything else is optional here
// and can be added inside the planner. Guests see their plan before being
// asked for an account (see /plan/preview).
export default function PlanPage() {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [postToFeed, setPostToFeed] = useState(true);
  const [more, setMore] = useState(false);
  const [withBudget, setWithBudget] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const started = useRef(false);
  const typeRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>({
    eventType: "",
    eventDate: "",
    name: "",
    suburb: "",
    guestCount: "",
    budgetTotal: 10000,
    requiredServices: [],
    notes: "",
    startTime: "",
    endTime: "",
  });

  // Coming back from the preview ("Edit") or a failed save: reopen the draft.
  useEffect(() => {
    let saved: ReturnType<typeof readDraft> = null;
    try {
      saved = readDraft(localStorage.getItem(DRAFT_STORAGE_KEY));
    } catch {
      return;
    }
    if (!saved) return;
    const d = saved.draft;
    // Browser storage is only readable after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    setDraft((cur) => ({
      ...cur,
      eventType: d.eventType ?? "",
      eventDate: d.eventDate ?? "",
      name: d.name ?? "",
      suburb: d.suburb ?? "",
      guestCount: d.guestCount ?? "",
      budgetTotal: d.budgetTotal || cur.budgetTotal,
      requiredServices: d.requiredServices ?? [],
      notes: d.notes ?? "",
      startTime: d.startTime ?? "",
      endTime: d.endTime ?? "",
    }));
    setWithBudget(!!d.budgetTotal);
    setPostToFeed(saved.postToFeed || !d.suburb);
    setMore(!!(d.suburb || d.guestCount || d.requiredServices?.length || d.startTime || d.notes || d.budgetTotal));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));
  const missing = missingForPlan(draft);
  const timesInvalid = !draft.startTime !== !draft.endTime;
  // Vendors in the Event Feed need to know where, how many and what for.
  const canPostToFeed = !!draft.suburb.trim() && !!draft.guestCount && draft.requiredServices.length > 0;

  function update(patch: Partial<Draft>) {
    if (!started.current) {
      started.current = true;
      trackPlannerGuest("plan_started");
    }
    setDraft((d) => ({ ...d, ...patch }));
  }

  function finish() {
    setTouched(true);
    setError(null);
    if (missing.length) {
      (draft.eventType ? dateRef.current : typeRef.current?.querySelector("button"))?.focus();
      return;
    }
    if (timesInvalid) {
      setMore(true);
      setError("Add both a start and an end time, or neither.");
      return;
    }
    const payload: PlanDraft = { ...draft, budgetTotal: withBudget ? draft.budgetTotal : 0 };
    const feed = postToFeed && canPostToFeed;
    startTransition(async () => {
      // Signed in: save straight away. Guests: keep the draft in this
      // browser and show them their plan first.
      const res = await claimEventPlan(payload);
      if (res.success && res.eventId) {
        if (feed) await publishEventToFeed(res.eventId);
        router.push(`/dashboard/events/${res.eventId}`);
        return;
      }
      if (res.error !== NOT_LOGGED_IN) {
        setError(res.error ?? "Couldn't save your event.");
        return;
      }
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft: payload, postToFeed: feed }));
      } catch {
        setError("Your browser blocked saving this plan. Create a free account to keep it.");
        return;
      }
      router.push("/plan/preview");
    });
  }

  const showTypeError = touched && !draft.eventType;
  const showDateError = touched && !draft.eventDate;

  return (
    <div className="mx-auto max-w-lg px-4 pt-8 pb-12 sm:pt-10">
      <h1 className="text-2xl font-bold tracking-tight">Plan your event</h1>
      <p className="mt-1 mb-8 text-[15px] text-muted-foreground">
        Two quick questions and your plan is ready: a timeline, a checklist and vendors that suit it. Add the rest
        whenever you like.
      </p>

      <div className="space-y-7">
        <fieldset aria-describedby={showTypeError ? `${id}-type-error` : undefined}>
          <legend className="mb-2 text-sm font-semibold">What are you planning?</legend>
          <div ref={typeRef} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={draft.eventType === t}
                onClick={() => update({ eventType: t })}
                className={cn(
                  "h-12 rounded-tile border px-4 text-[15px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  draft.eventType === t ? "surface-pressed font-semibold text-foreground ring-1 ring-primary/40" : "btn-raised text-foreground/80"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {showTypeError && (
            <p id={`${id}-type-error`} className="mt-2 text-sm text-destructive-text">
              Choose what you&apos;re planning.
            </p>
          )}
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor={`${id}-date`}>When is it?</Label>
          <Input
            ref={dateRef}
            id={`${id}-date`}
            type="date"
            min={earliestEventDate()}
            value={draft.eventDate}
            aria-invalid={showDateError || undefined}
            aria-describedby={`${id}-date-hint`}
            onChange={(e) => update({ eventDate: e.target.value })}
          />
          <p id={`${id}-date-hint`} className={cn("text-[13px]", showDateError ? "text-destructive-text" : "text-muted-foreground")}>
            {showDateError ? "Pick a date. A best guess is fine." : "Not sure yet? Pick your best guess. You can change it any time."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>Name (optional)</Label>
          <Input
            id={`${id}-name`}
            maxLength={80}
            value={draft.name}
            placeholder={draft.eventType ? defaultEventName(draft.eventType) : "e.g. Sam & Priya's wedding"}
            onChange={(e) => update({ name: e.target.value })}
          />
        </div>

        <div className="rounded-card surface-raised">
          <button
            type="button"
            aria-expanded={more}
            aria-controls={`${id}-more`}
            onClick={() => setMore((v) => !v)}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              <span className="block font-semibold">More details (optional)</span>
              <span className="block text-[13px] text-muted-foreground">Location, guests, vendors, times, budget</span>
            </span>
            <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", more && "rotate-180")} aria-hidden />
          </button>

          {more && (
            <div id={`${id}-more`} className="space-y-6 border-t border-border/70 px-4 pt-5 pb-5">
              <div className="space-y-2">
                <Label htmlFor={`${id}-suburb`}>Suburb</Label>
                <Input id={`${id}-suburb`} placeholder="e.g. Bondi" value={draft.suburb} onChange={(e) => update({ suburb: e.target.value })} />
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold">How many guests?</legend>
                <div className="grid grid-cols-3 gap-2">
                  {GUEST_BUCKETS.map((bucket) => (
                    <button
                      key={bucket}
                      type="button"
                      aria-pressed={draft.guestCount === bucket}
                      onClick={() => update({ guestCount: draft.guestCount === bucket ? "" : bucket })}
                      className={cn(
                        "h-11 rounded-tile border px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        draft.guestCount === bucket ? "surface-pressed font-semibold text-foreground ring-1 ring-primary/40" : "btn-raised text-foreground/80"
                      )}
                    >
                      {bucket}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1 text-sm font-semibold">Vendors you already know you need</legend>
                <p className="mb-2 text-[13px] text-muted-foreground">Not sure? Skip it: your plan suggests vendors that suit your event.</p>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((c) => {
                    const selected = draft.requiredServices.includes(c.value);
                    return (
                      <button
                        key={c.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          update({
                            requiredServices: selected ? draft.requiredServices.filter((v) => v !== c.value) : [...draft.requiredServices, c.value],
                          })
                        }
                        className={cn(
                          "flex h-12 items-center gap-2 rounded-tile border pr-3 pl-1.5 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "surface-pressed font-semibold text-foreground ring-1 ring-primary/40" : "btn-raised text-foreground/80"
                        )}
                      >
                        <CategoryArt value={c.value} className="size-9 shrink-0" />
                        <span className="min-w-0 truncate">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Start and end time</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" aria-label="Start time" value={draft.startTime} onChange={(e) => update({ startTime: e.target.value })} />
                  <Input type="time" aria-label="End time" value={draft.endTime} onChange={(e) => update({ endTime: e.target.value })} />
                </div>
                <p className={cn("text-[13px]", timesInvalid && touched ? "text-destructive-text" : "text-muted-foreground")}>
                  {formatEventTimes(draft.startTime || null, draft.endTime || null) ??
                    (timesInvalid ? "Add both a start and an end time, or neither." : "Times help vendors price for your event's length.")}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p id={`${id}-budget-label`} className="text-sm font-semibold">
                    Set a budget
                  </p>
                  <Switch checked={withBudget} onCheckedChange={setWithBudget} aria-labelledby={`${id}-budget-label`} />
                </div>
                {withBudget && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">${groupDigits(BUDGET_MIN)}</span>
                      <span className="font-semibold text-primary-text">${groupDigits(draft.budgetTotal)}</span>
                      <span className="text-muted-foreground">${groupDigits(BUDGET_MAX)}</span>
                    </div>
                    <input
                      type="range"
                      min={BUDGET_MIN}
                      max={BUDGET_MAX}
                      step={250}
                      value={draft.budgetTotal}
                      onChange={(e) => update({ budgetTotal: Number(e.target.value) })}
                      aria-label="Total budget"
                      className="h-6 w-full accent-[var(--primary)]"
                    />
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${id}-notes`}>Special requirements</Label>
                <Textarea
                  id={`${id}-notes`}
                  rows={3}
                  maxLength={2000}
                  placeholder="Theme, must-have shots, accessibility, cultural requirements…"
                  value={draft.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                />
              </div>

              {canPostToFeed && (
                <div className="flex items-start justify-between gap-4 rounded-tile surface-pressed p-4">
                  <div>
                    <p id={`${id}-feed-label`} className="text-sm font-semibold">
                      Let vendors come to you
                    </p>
                    <p className="text-[13px] text-foreground/70">Post this event to the vendor feed so approved vendors can send you quotes.</p>
                  </div>
                  <Switch checked={postToFeed} onCheckedChange={setPostToFeed} aria-labelledby={`${id}-feed-label`} />
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        )}
        <div>
          <Button className="btn-coral h-12 w-full text-base" size="lg" disabled={pending} onClick={finish}>
            {pending ? "Creating your plan…" : "Create my plan"}
          </Button>
          <p className="mt-2 text-center text-[13px] text-muted-foreground" aria-live="polite">
            {touched && missing.length ? `Still needed: ${missing.join(" and ")}.` : "Free. See your plan before you create an account."}
          </p>
        </div>
      </div>
    </div>
  );
}
