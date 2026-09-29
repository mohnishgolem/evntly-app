import { createClient } from "@/lib/supabase/server";

export async function getJobCardForBooking(bookingId: string) {
  const supabase = await createClient();
  const { data: jobCard } = await supabase
    .from("job_cards")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!jobCard) return { jobCard: null, checklist: [] };

  const { data: checklist } = await supabase
    .from("stage_checklist_items")
    .select("*")
    .eq("job_card_id", jobCard.id)
    .order("order", { ascending: true, nullsFirst: false });

  return { jobCard, checklist: checklist ?? [] };
}
