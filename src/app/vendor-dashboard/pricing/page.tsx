import type { Metadata } from "next";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { PackageList, ServiceAreaForm, type VendorPackageRow } from "@/components/vendor-pricing";
import { categoryLabel } from "@/lib/config";

export const metadata: Metadata = {
  title: "Service & pricing",
  robots: { index: false, follow: false },
};

export default async function VendorPricingPage() {
  await requireVendor("/vendor-dashboard/pricing");
  const supabase = await createClient();

  const { data: listings } = await supabase
    .rpc("my_service_providers")
    .select("id, name, service_type, city, hourly_rate, service_radius_km, free_travel_km, travel_fee_cents_per_km, travels_regional, min_booking_hours")
    .order("created_at", { ascending: false });

  const ids = (listings ?? []).map((l) => l.id);
  const { data: packages } = ids.length
    ? await supabase
        .from("vendor_packages")
        .select("id, provider_id, name, description, price_cents, included_hours, extra_hour_cents, inclusions, delivery_days, deposit_percent, active, sort_order")
        .in("provider_id", ids)
        .order("sort_order")
        .order("price_cents")
    : { data: [] as VendorPackageRow[] };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Service & pricing</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Where you work and what you charge. Evntly uses these to match you with events that suit you, and shows customers
        an estimate before they ask for a quote.
      </p>
      <DashboardNav tabs="vendorBusinessTabs" />

      <div className="space-y-10">
        {(listings ?? []).map((l) => (
          <section key={l.id} className="space-y-6">
            {(listings ?? []).length > 1 && (
              <h2 className="text-lg font-semibold">
                {l.name} <span className="font-normal text-muted-foreground">· {categoryLabel(l.service_type)}</span>
              </h2>
            )}
            <ServiceAreaForm
              listingId={l.id}
              baseSuburb={l.city}
              initial={{
                radiusKm: l.service_radius_km ? Math.round(l.service_radius_km) : 40,
                freeTravelKm: l.free_travel_km ?? 0,
                travelFeePerKm: (l.travel_fee_cents_per_km ?? 0) / 100,
                travelsRegional: !!l.travels_regional,
                minBookingHours: l.min_booking_hours == null ? null : Number(l.min_booking_hours),
              }}
            />
            <PackageList
              listingId={l.id}
              hourlyRate={Number(l.hourly_rate) || 0}
              packages={(packages ?? []).filter((p) => p.provider_id === l.id)}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
