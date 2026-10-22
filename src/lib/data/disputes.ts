import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DisputeView } from "@/components/dispute-panel";
import type { DisputeStatus } from "@/lib/disputes";

const DISPUTE_COLUMNS =
  "id, booking_id, reason, description, desired_outcome, status, outcome, resolution_note, opened_by_role, opened_by_user_id, customer_user_id, vendor_user_id, created_at, updated_at" as const;

/** Disputes on one booking with their threads, read under the caller's RLS (parties + admins). */
export async function loadBookingDisputes(bookingId: string, viewerId: string): Promise<DisputeView[]> {
  const supabase = await createClient();
  const { data: disputes } = await supabase
    .from("booking_disputes")
    .select(DISPUTE_COLUMNS)
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (!disputes?.length) return [];
  const { data: messages } = await supabase
    .from("booking_dispute_messages")
    .select("id, dispute_id, author_role, author_user_id, body, created_at")
    .in(
      "dispute_id",
      disputes.map((d) => d.id)
    )
    .order("created_at");
  return disputes.map((d) => ({
    id: d.id,
    reason: d.reason,
    description: d.description,
    desired_outcome: d.desired_outcome,
    status: d.status as DisputeStatus,
    outcome: d.outcome,
    resolution_note: d.resolution_note,
    opened_by_role: d.opened_by_role as "customer" | "vendor",
    openedByMe: d.opened_by_user_id === viewerId,
    created_at: d.created_at,
    messages: (messages ?? [])
      .filter((m) => m.dispute_id === d.id)
      .map((m) => ({
        id: m.id,
        author_role: m.author_role as "customer" | "vendor" | "admin",
        mine: m.author_user_id === viewerId,
        body: m.body,
        created_at: m.created_at,
      })),
  }));
}

export type AdminDisputeRow = {
  id: string;
  booking_id: string;
  reason: string;
  status: DisputeStatus;
  outcome: string | null;
  opened_by_role: string;
  created_at: string;
  updated_at: string;
  description: string;
};

/** Admin queue: live disputes oldest first, then the latest closed ones. RLS: admins see all. */
export async function loadDisputeQueue() {
  const supabase = await createClient();
  const [{ data: live }, { data: closed }] = await Promise.all([
    supabase
      .from("booking_disputes")
      .select("id, booking_id, reason, status, outcome, opened_by_role, created_at, updated_at, description")
      .in("status", ["open", "under_review"])
      .order("created_at"),
    supabase
      .from("booking_disputes")
      .select("id, booking_id, reason, status, outcome, opened_by_role, created_at, updated_at, description")
      .in("status", ["resolved", "withdrawn"])
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);
  return { live: (live ?? []) as AdminDisputeRow[], closed: (closed ?? []) as AdminDisputeRow[] };
}
