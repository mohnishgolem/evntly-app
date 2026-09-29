"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PlanDraft = {
  eventType: string;
  eventDate: string;
  suburb: string;
  guestCount: string;
  budgetTotal: number;
  requiredServices: string[];
  notes?: string;
};

export async function claimEventPlan(draft: PlanDraft) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "Not logged in" };
  }

  const { error } = await supabase.from("events").insert({
    organiser_email: user.email,
    event_type: draft.eventType,
    event_date: draft.eventDate,
    suburb: draft.suburb,
    guest_count: draft.guestCount,
    budget_total: draft.budgetTotal,
    required_services: draft.requiredServices,
    notes: draft.notes || null,
    status: "planning",
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}
