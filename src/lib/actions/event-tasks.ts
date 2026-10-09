"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

export async function addEventTask(eventId: string, title: string): Promise<ActionState> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Write a task first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "Not logged in." };

  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("organiser_email", user.email)
    .maybeSingle();

  if (!event) return { error: "Not your event." };

  const { error } = await supabase.from("event_tasks").insert({
    event_id: eventId,
    owner_email: user.email,
    title: trimmed,
    done: false,
  });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/events/${eventId}`);
  return { success: true };
}

export async function toggleEventTask(taskId: string, done: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { error: "Not logged in." };

  const { data: task, error } = await supabase
    .from("event_tasks")
    .update({ done })
    .eq("id", taskId)
    .eq("owner_email", user.email)
    .select("event_id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/events/${task.event_id}`);
  return { success: true };
}
