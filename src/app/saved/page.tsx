import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { VendorCard } from "@/components/vendor-card";

export default async function SavedVendorsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/saved");

  const savedIds = session.profile?.saved_providers ?? [];
  const supabase = await createClient();
  const { data: vendors } =
    savedIds.length > 0
      ? await supabase.from("service_providers").select("*").in("id", savedIds)
      : { data: [] };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Saved vendors</h1>
      <p className="mb-6 text-sm text-muted-foreground">Vendors you&apos;ve bookmarked for later.</p>

      {!vendors || vendors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Heart className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="mb-1 text-lg font-semibold">No saved vendors yet</p>
          <p className="text-sm text-muted-foreground">
            Tap the heart on any vendor to save them here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          {vendors.map((v) => (
            <VendorCard key={v.id} vendor={v} saved isAuthenticated />
          ))}
        </div>
      )}
    </div>
  );
}
