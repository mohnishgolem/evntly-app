import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { VendorSelectionGrid } from "@/components/vendor-selection-grid";
import { PUBLIC_VENDOR_COLUMNS, type PublicVendor } from "@/lib/vendor-columns";

type Vendor = PublicVendor;

export default async function EventVendorSelectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/events");

  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("organiser_user_id", session.user.id)
    .maybeSingle();

  if (!event) notFound();

  let vendors: Vendor[] = [];
  if (event.required_services.length > 0) {
    const { data } = await supabase
      .from("service_providers")
      .select(PUBLIC_VENDOR_COLUMNS)
      .eq("status", "approved")
      .in("service_type", event.required_services)
      .order("founding_vendor", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
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
