import Link from "next/link";
import { Star, ShieldCheck } from "lucide-react";
import { categoryLabel, categoryIcon, SITE_URL } from "@/lib/config";
import { SaveVendorButton } from "@/components/save-vendor-button";
import { ShareButton } from "@/components/share-button";
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
    <Link href={`/vendor/${vendor.id}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
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
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {vendor.available && (
              <div className="flex items-center gap-1 overflow-hidden rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-success shadow-sm">
                <span className="size-1.5 shrink-0 rounded-full bg-success" />
                <span className="hidden truncate sm:inline">Available</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <SaveVendorButton
              vendorId={vendor.id}
              initialSaved={saved}
              isAuthenticated={isAuthenticated}
            />
            <ShareButton
              url={`${SITE_URL}/vendor/${vendor.id}`}
              title={vendor.name}
              text={`${vendor.name} — ${categoryLabel(vendor.service_type)} on Evntly`}
            />
          </div>
        </div>
      </div>
      <div className="pt-2.5">
        <div className="flex items-start justify-between gap-1">
          <p className="flex min-w-0 items-center gap-1 text-sm leading-snug font-semibold">
            <span className="truncate">{vendor.name}</span>
            {vendor.verified && (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </p>
          {!!vendor.rating && vendor.rating > 0 && (
            <div className="flex shrink-0 items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-foreground text-foreground" />
              <span className="text-sm">
                {vendor.rating.toFixed(1)}
                {!!vendor.review_count && (
                  <span className="text-muted-foreground"> ({vendor.review_count})</span>
                )}
              </span>
            </div>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {categoryLabel(vendor.service_type)}
          {vendor.city ? ` · ${vendor.city}` : ""}
        </p>
        <p className="mt-1.5 text-sm">
          <span className="font-semibold">${vendor.hourly_rate}</span>
          <span className="text-muted-foreground"> / hr</span>
        </p>
      </div>
    </Link>
  );
}
