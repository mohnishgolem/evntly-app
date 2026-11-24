import { z } from "zod";
import { EVENT_TYPES, GUEST_BUCKETS } from "@/lib/config";
import { eventTimesSchema } from "@/lib/event-times";

// The event a customer starts with. Only what a useful plan needs is
// required: what it is and roughly when. Everything else can be added inside
// the planner later (location, guests, budget, vendors, times, notes).
// Shared by /plan (browser), the guest preview and claimEventPlan (server).

export type PlanDraft = {
  eventType: string;
  eventDate: string;
  name?: string;
  suburb?: string;
  guestCount?: string;
  budgetTotal?: number;
  requiredServices?: string[];
  notes?: string;
  /** "HH:MM", Sydney. */
  startTime?: string;
  endTime?: string;
};

export const DRAFT_STORAGE_KEY = "evntly_plan_draft";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

const draftFields = z.object({
  eventType: z.enum(EVENT_TYPES, { error: "Choose what you're planning." }),
  eventDate: z.iso.date({ error: "Pick a date. A best guess is fine." }),
  name: optionalText(80),
  suburb: optionalText(120),
  // Older drafts and the "skip" choice both arrive as "".
  guestCount: z.union([z.enum(GUEST_BUCKETS), z.literal("")]).optional().default(""),
  budgetTotal: z.number().min(0).max(10_000_000).optional().default(0),
  requiredServices: z.array(z.string()).max(20).optional().default([]),
  notes: optionalText(2000),
});

export const planDraftSchema = draftFields.and(eventTimesSchema);

/** What /plan shows next to the button instead of disabling it silently. */
export function missingForPlan(d: Pick<PlanDraft, "eventType" | "eventDate">) {
  const missing: string[] = [];
  if (!d.eventType) missing.push("what you're planning");
  if (!d.eventDate) missing.push("a date");
  return missing;
}

const DEFAULT_NAMES: Record<string, string> = {
  Wedding: "Our wedding",
  Engagement: "Our engagement party",
  Birthday: "Birthday celebration",
  Corporate: "Company event",
  Cultural: "Our celebration",
  Party: "Our party",
};

/** The name shown until the organiser gives one. */
export function defaultEventName(eventType: string) {
  return DEFAULT_NAMES[eventType] ?? "Our event";
}

/** Saved drafts from before the form changed still open: fill new fields in. */
export function readDraft(raw: string | null): { draft: PlanDraft; postToFeed: boolean } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const draft = (parsed?.draft ?? parsed) as PlanDraft;
    if (!draft || typeof draft !== "object" || typeof draft.eventType !== "string") return null;
    return { draft, postToFeed: !!parsed?.postToFeed };
  } catch {
    return null;
  }
}
