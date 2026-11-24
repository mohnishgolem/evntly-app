"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { templatesFor } from "@/lib/planner/checklist";
import { recordPlannerEvent } from "@/lib/planner/analytics";

// Planner items (event_tasks) and dismissed suggestions (events.
// planner_dismissed). Every action checks the event is the caller's own; RLS
// enforces the same thing again in the database (20261128090000).

export type PlannerActionState = { error?: string; success?: boolean } | null;

const KINDS = ["task", "schedule", "reminder", "note"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time.");

const itemSchema = z
  .object({
    kind: z.enum(KINDS),
    title: z.string().trim().min(1, "Give it a title.").max(120, "Keep the title under 120 characters."),
    date: isoDate.nullable(),
    time: clock.nullable(),
    details: z.string().trim().max(500, "Keep notes under 500 characters.").nullable(),
  })
  .refine((v) => !v.time || v.date || v.kind === "schedule", { message: "Add a date for that time.", path: ["date"] })
  .refine((v) => v.kind !== "reminder" || !!v.date, { message: "Reminders need a date.", path: ["date"] });

export type PlannerItemInput = z.input<typeof itemSchema>;

async function ownEvent(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || typeof eventId !== "string") return { supabase, user: null, event: null };
  const { data: event } = await supabase
    .from("events")
    .select("id, event_date, event_type, required_services, planner_dismissed")
    .eq("id", eventId)
    .eq("organiser_user_id", user.id)
    .maybeSingle();
  return { supabase, user, event };
}

function revalidate(eventId: string) {
  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath(`/dashboard/events/${eventId}/day`);
}

const friendly = (message: string) =>
  /row-level security|permission/i.test(message) ? "That event isn't yours." : "Couldn't save that. Please try again.";

export async function addPlannerItem(eventId: string, input: PlannerItemInput): Promise<PlannerActionState> {
  const { supabase, user, event } = await ownEvent(eventId);
  if (!user || !event) return { error: "Event not found." };
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const v = parsed.data;
  // A schedule item with only a time happens on the event day.
  const date = v.kind === "schedule" ? (v.date ?? event.event_date) : v.date;

  // New untimed items go to the end of their day.
  const { data: last } = await supabase
    .from("event_tasks")
    .select("position")
    .eq("event_id", eventId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("event_tasks").insert({
    event_id: eventId,
    owner_email: user.email!,
    title: v.title,
    kind: v.kind,
    due_date: date,
    due_time: v.time,
    details: v.details || null,
    done: false,
    position: (last?.position ?? 0) + 1,
  });
  if (error) return { error: friendly(error.message) };
  revalidate(eventId);
  return { success: true };
}

export async function updatePlannerItem(eventId: string, itemId: string, input: PlannerItemInput): Promise<PlannerActionState> {
  const { supabase, user, event } = await ownEvent(eventId);
  if (!user || !event) return { error: "Event not found." };
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const v = parsed.data;
  const { error } = await supabase
    .from("event_tasks")
    .update({
      title: v.title,
      kind: v.kind,
      due_date: v.kind === "schedule" ? (v.date ?? event.event_date) : v.date,
      due_time: v.time,
      details: v.details || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("event_id", eventId);
  if (error) return { error: friendly(error.message) };
  revalidate(eventId);
  return { success: true };
}

export async function deletePlannerItem(eventId: string, itemId: string): Promise<PlannerActionState> {
  const { supabase, event } = await ownEvent(eventId);
  if (!event) return { error: "Event not found." };
  const { error } = await supabase.from("event_tasks").delete().eq("id", itemId).eq("event_id", eventId);
  if (error) return { error: friendly(error.message) };
  revalidate(eventId);
  return { success: true };
}

export async function setPlannerItemDone(eventId: string, itemId: string, done: boolean): Promise<PlannerActionState> {
  const { supabase, user, event } = await ownEvent(eventId);
  if (!user || !event) return { error: "Event not found." };
  const { error } = await supabase
    .from("event_tasks")
    .update({ done: !!done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", itemId)
    .eq("event_id", eventId);
  if (error) return { error: friendly(error.message) };
  if (done) await recordPlannerEvent("task_completed", { userId: user.id, eventId, detail: "custom" });
  revalidate(eventId);
  return { success: true };
}

/** Moves an untimed item one place up or down among its day's items. */
export async function movePlannerItem(eventId: string, itemId: string, direction: "up" | "down"): Promise<PlannerActionState> {
  const { supabase, event } = await ownEvent(eventId);
  if (!event) return { error: "Event not found." };
  const { data: item } = await supabase
    .from("event_tasks")
    .select("id, due_date, kind, position")
    .eq("id", itemId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!item || item.due_date == null) return { error: "Item not found." };
  const { data: siblings } = await supabase
    .from("event_tasks")
    .select("id, position, created_at")
    .eq("event_id", eventId)
    .eq("due_date", item.due_date)
    .is("due_time", null)
    .neq("kind", "task")
    .order("position")
    .order("created_at");
  const list = siblings ?? [];
  const i = list.findIndex((s) => s.id === itemId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= list.length) return { success: true };
  [list[i], list[j]] = [list[j], list[i]];
  // Renumber the day so positions are unique and stable.
  for (const [n, s] of list.entries()) {
    if (s.position !== n + 1) {
      const { error } = await supabase.from("event_tasks").update({ position: n + 1 }).eq("id", s.id).eq("event_id", eventId);
      if (error) return { error: friendly(error.message) };
    }
  }
  revalidate(eventId);
  return { success: true };
}

/**
 * Completes, reopens, renames or dismisses a checklist suggestion. The first
 * action on a suggestion stores it (template_key); later ones update it.
 */
export async function updateChecklistSuggestion(
  eventId: string,
  key: string,
  change: { done?: boolean; dismissed?: boolean; title?: string }
): Promise<PlannerActionState> {
  const { supabase, user, event } = await ownEvent(eventId);
  if (!user || !event) return { error: "Event not found." };
  const template = templatesFor(event.event_type, event.required_services).find((t) => t.key === key);
  if (!template) return { error: "That suggestion has changed. Refresh and try again." };
  const title = change.title === undefined ? undefined : change.title.trim();
  if (title !== undefined && (title.length < 1 || title.length > 120)) return { error: "Give it a title under 120 characters." };

  const patch = {
    ...(change.done === undefined ? {} : { done: change.done, completed_at: change.done ? new Date().toISOString() : null }),
    ...(change.dismissed === undefined ? {} : { dismissed: change.dismissed }),
    ...(title === undefined ? {} : { title }),
  };
  const { data: existing } = await supabase
    .from("event_tasks")
    .select("id")
    .eq("event_id", eventId)
    .eq("template_key", key)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("event_tasks").update(patch).eq("id", existing.id).eq("event_id", eventId)
    : await supabase.from("event_tasks").insert({
        event_id: eventId,
        owner_email: user.email!,
        title: template.title,
        kind: "task",
        template_key: key,
        done: false,
        ...patch,
      });
  if (error) return { error: friendly(error.message) };
  if (change.done) await recordPlannerEvent("task_completed", { userId: user.id, eventId, detail: key });
  revalidate(eventId);
  return { success: true };
}

/** Hides a suggestion card ("rec:dj", "idea:florist") for this event. */
export async function dismissPlannerSuggestion(eventId: string, key: string): Promise<PlannerActionState> {
  const { supabase, event } = await ownEvent(eventId);
  if (!event) return { error: "Event not found." };
  if (typeof key !== "string" || !/^(rec|idea):[a-z_]{2,30}$/.test(key)) return { error: "Unknown suggestion." };
  const current = event.planner_dismissed ?? [];
  if (current.includes(key)) return { success: true };
  const { error } = await supabase
    .from("events")
    .update({ planner_dismissed: [...current, key].slice(-60) })
    .eq("id", eventId);
  if (error) return { error: friendly(error.message) };
  revalidate(eventId);
  return { success: true };
}
