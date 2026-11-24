import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PlannerRow } from "@/lib/planner/timeline";

// Reads for the planner that the event board doesn't already load: the
// organiser's planner items and how many real vendors each category has.

const ROW_COLUMNS = "id, title, kind, due_date, due_time, details, done, dismissed, position, created_at, template_key" as const;

export type PlannerData = {
  rows: (PlannerRow & { template_key: string | null })[];
  /** false until the 20261128090000_event_planner migration is applied */
  ready: boolean;
  approvedCounts: Map<string, number>;
};

export async function loadPlanner(eventId: string): Promise<PlannerData> {
  const supabase = await createClient();
  const [rowsRes, vendorsRes] = await Promise.all([
    supabase.from("event_tasks").select(ROW_COLUMNS).eq("event_id", eventId).order("position").order("created_at"),
    // Approved, real listings only: sample listings never count as options.
    supabase.from("service_providers").select("service_type").eq("status", "approved").not("is_demo", "is", true).limit(2000),
  ]);

  let rows = rowsRes.data ?? [];
  let ready = !rowsRes.error;
  if (rowsRes.error) {
    // Before the migration: the old flat run-sheet tasks still show.
    const legacy = await supabase.from("event_tasks").select("id, title, done, created_at").eq("event_id", eventId).order("created_at");
    rows = (legacy.data ?? []).map((t) => ({
      ...t,
      kind: "task",
      due_date: null,
      due_time: null,
      details: null,
      dismissed: false,
      position: 0,
      template_key: null,
    }));
    ready = false;
  }

  const approvedCounts = new Map<string, number>();
  for (const v of vendorsRes.data ?? []) approvedCounts.set(v.service_type, (approvedCounts.get(v.service_type) ?? 0) + 1);

  return { rows, ready, approvedCounts };
}
