"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BudgetActionState = { error?: string; success?: boolean };

const MAX_AMOUNT = 10_000_000;

function parseAmount(value: unknown) {
  const n = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ? Math.round(n * 100) / 100 : null;
}

// RLS limits every write to the caller's own events; these checks just give
// clean errors instead of raw Postgres ones.
async function ownEvent(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, event: null };
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organiser_user_id", user.id)
    .maybeSingle();
  return { supabase, user, event };
}

export async function setEventBudget(eventId: string, amount: string): Promise<BudgetActionState> {
  const value = parseAmount(amount);
  if (value == null) return { error: "Enter a budget between $0 and $10,000,000." };
  const { supabase, event } = await ownEvent(eventId);
  if (!event) return { error: "Event not found." };
  const { error } = await supabase.from("events").update({ budget_total: value }).eq("id", eventId);
  if (error) return { error: "Couldn't save the budget." };
  revalidatePath(`/dashboard/events/${eventId}`);
  return { success: true };
}

export async function addBudgetItem(eventId: string, label: string, amount: string): Promise<BudgetActionState> {
  const name = label.trim();
  const value = parseAmount(amount);
  if (!name || name.length > 120) return { error: "Give the cost a short name." };
  if (value == null) return { error: "Enter an amount." };
  const { supabase, event } = await ownEvent(eventId);
  if (!event) return { error: "Event not found." };
  const { error } = await supabase.from("event_budget_items").insert({ event_id: eventId, label: name, amount: value });
  if (error) return { error: "Couldn't add that cost." };
  revalidatePath(`/dashboard/events/${eventId}`);
  return { success: true };
}

export async function setBudgetItemPaid(eventId: string, itemId: string, paid: boolean): Promise<BudgetActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_budget_items").update({ paid }).eq("id", itemId).eq("event_id", eventId);
  if (error) return { error: "Couldn't update that cost." };
  revalidatePath(`/dashboard/events/${eventId}`);
  return { success: true };
}

export async function removeBudgetItem(eventId: string, itemId: string): Promise<BudgetActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_budget_items").delete().eq("id", itemId).eq("event_id", eventId);
  if (error) return { error: "Couldn't remove that cost." };
  revalidatePath(`/dashboard/events/${eventId}`);
  return { success: true };
}
