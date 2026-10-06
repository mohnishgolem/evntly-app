import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { EditListingForm } from "@/components/edit-listing-form";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard");

  const { id } = await params;
  const email = session.user.email as string;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("service_providers")
    .select("*")
    .eq("id", id)
    .eq("owner_email", email)
    .maybeSingle();

  if (!listing) notFound();

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-6 text-xl font-bold">Edit your listing</h1>
      <EditListingForm
        listingId={listing.id}
        initial={{
          businessName: listing.name,
          bio: listing.bio ?? "",
          serviceType: listing.service_type,
          hourlyRate: listing.hourly_rate,
          city: listing.city ?? "",
          locationsServiced: listing.locations_serviced ?? [],
          eventTypes: listing.event_types ?? [],
          phone: listing.phone ?? "",
        }}
      />
    </div>
  );
}
