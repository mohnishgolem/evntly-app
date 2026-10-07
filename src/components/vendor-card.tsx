import Link from "next/link";
import { Star, ShieldCheck } from "lucide-react";
import { categoryLabel, categoryIcon } from "@/lib/config";
import { SaveVendorButton } from "@/components/save-vendor-button";
import type { Database } from "@/lib/supabase/database.types";

type Vendor = Database["public"]["Tables"]["service_providers"]["Row"];

export function VendorCard({
  vendor,
  saved = false,
  isAuthenticated = false,
}: {
  vendor: Vendor;
  saved?: boolean;
  isAuthenticated?: boolean;
}) {
  return (
    <Link
      href={`/vendor/${vendor.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-muted">
        {vendor.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.avatar_url}
            alt={vendor.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 text-4xl">
            {categoryIcon(vendor.service_type)}
          </div>
        )}
        {vendor.available && (
          <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-success shadow-sm">
            <span className="size-1.5 rounded-full bg-success" />
            Available
          </div>
        )}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <SaveVendorButton
            vendorId={vendor.id}
            initialSaved={saved}
            isAuthenticated={isAuthenticated}
          />
          {vendor.verified && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="truncate text-sm leading-snug font-semibold">{vendor.name}</p>
          {!!vendor.rating && vendor.rating > 0 && (
            <div className="flex shrink-0 items-center gap-0.5">
              <Star className="h-3.5 w-3.5 fill-champagne text-champagne" />
              <span className="text-sm font-medium">{vendor.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{categoryLabel(vendor.service_type)}</p>
        {vendor.city && <p className="text-sm text-muted-foreground">{vendor.city}</p>}
        <p className="mt-1 text-sm">
          <span className="font-semibold">${vendor.hourly_rate}</span>
          <span className="text-muted-foreground"> / hr</span>
        </p>
      </div>
    </Link>
  );
}
