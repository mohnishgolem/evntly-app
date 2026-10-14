import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { PortfolioUploader } from "@/components/portfolio-uploader";
import { DashboardNav } from "@/components/dashboard-nav";
import { VENDOR_NAV_ITEMS } from "@/lib/nav";

export default async function VendorPortfolioPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard/portfolio");

  const supabase = await createClient();
  const { data: listing } = await supabase
    .rpc("my_service_providers")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!listing) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Create your listing first.</p>
        <Link href="/vendor-signup" className="text-sm font-semibold underline underline-offset-2">
          Set up my listing
        </Link>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("portfolio_items")
    .select("*")
    .eq("provider_id", listing.id)
    .order("sort_order", { ascending: true, nullsFirst: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Portfolio</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Photos customers see on your {listing.name} listing.
      </p>

      <DashboardNav items={VENDOR_NAV_ITEMS} />
      <PortfolioUploader providerId={listing.id} items={items ?? []} />
    </div>
  );
}
