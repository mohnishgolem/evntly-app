import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { VendorSelectionGrid } from "@/components/vendor-selection-grid";
import type { Database } from "@/lib/supabase/database.types";

type Vendor = Database["public"]["Tables"]["service_providers"]["Row"];

export default async function EventVendorSelectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/events");

  const { id } = await params;
  const email = session.user.email as string;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("organiser_email", email)
    .maybeSingle();

  if (!event) notFound();

  let vendors: Vendor[] = [];
  if (event.required_services.length > 0) {
    const { data } = await supabase
      .from("service_providers")
      .select("*")
      .eq("status", "approved")
      .in("service_type", event.required_services)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(12);
    vendors = data ?? [];
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Pick your vendors</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Hand-picked for {event.event_type} in {event.suburb}. Select the ones you&apos;d like to
        hear from.
      </p>

      {vendors && vendors.length > 0 ? (
        <VendorSelectionGrid eventId={event.id} vendors={vendors} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No approved vendors match your required services yet — check back soon.
        </p>
      )}
    </div>
  );
}
