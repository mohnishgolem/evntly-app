import Link from "next/link";
import { Star, ShieldCheck } from "lucide-react";
import { categoryLabel, categoryIcon, SITE_URL } from "@/lib/config";
import { FoundingBadge } from "@/components/founding-badge";
import { SampleBadge } from "@/components/sample-badge";
import { SaveVendorButton } from "@/components/save-vendor-button";
import { ShareButton } from "@/components/share-button";
import type { PublicVendor } from "@/lib/vendor-columns";
import { vendorPrice } from "@/lib/pricing-model";
import { listingCoverUrl } from "@/lib/portfolio-media";
import { cn } from "@/lib/utils";

type Vendor = PublicVendor;

// Marketplace card: the photo does the work. One badge at most on the image
// (Founding or Sample), save and share as small frosted buttons, and the
// facts (category, area, availability, price) in calm text underneath.
export function VendorCard({
  vendor,
  saved = false,
  isAuthenticated = false,
  className,
  priority = false,
}: {
  vendor: Vendor;
  saved?: boolean;
  isAuthenticated?: boolean;
  className?: string;
  /** Eager-load the photo (first cards above the fold). */
  priority?: boolean;
}) {
  const CategoryIcon = categoryIcon(vendor.service_type);
  const price = vendorPrice(vendor);
  const cover = listingCoverUrl(vendor, 600);
  const frosted = "bg-background/85 shadow-none backdrop-blur-md ring-1 ring-black/5 dark:ring-white/10";

  return (
    <Link href={`/vendor/${vendor.id}`} className={cn("group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted sm:aspect-square">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={vendor.name}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-standard group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-secondary to-muted">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-background shadow-card">
              {/* eslint-disable-next-line react-hooks/static-components -- categoryIcon returns a stateless lucide icon, not a dynamically-defined component */}
              <CategoryIcon className="size-7 text-foreground/70" strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-muted-foreground">{categoryLabel(vendor.service_type)}</span>
          </div>
        )}
        {/* Soft top shade keeps the badge and buttons legible on bright photos. */}
        {cover && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent" />}
        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {vendor.is_demo ? <SampleBadge compact /> : vendor.founding_vendor ? <FoundingBadge compact /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ShareButton
              size="sm"
              className={cn("size-8", frosted)}
              url={`${SITE_URL}/vendor/${vendor.id}`}
              title={vendor.name}
              text={`${vendor.name} — ${categoryLabel(vendor.service_type)} on Evntly`}
            />
            <SaveVendorButton size="sm" className={cn("size-8", frosted)} vendorId={vendor.id} initialSaved={saved} isAuthenticated={isAuthenticated} />
          </div>
        </div>
      </div>
      <div className="px-0.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1 text-[15px] leading-snug font-semibold">
            <span className="truncate">{vendor.name}</span>
            {vendor.verified && <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-label="Verified" />}
          </p>
          {!!vendor.rating && vendor.rating > 0 && (
            <p className="flex shrink-0 items-center gap-1 text-sm">
              <Star className="size-3.5 fill-foreground text-foreground" aria-hidden />
              <span>
                {vendor.rating.toFixed(1)}
                {!!vendor.review_count && <span className="text-muted-foreground"> ({vendor.review_count})</span>}
              </span>
            </p>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {categoryLabel(vendor.service_type)}
          {vendor.city ? ` · ${vendor.city}` : ""}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="truncate text-sm">
            <span className="font-semibold">{price.figure}</span>
            {price.suffix && <span className="text-muted-foreground"> {price.suffix}</span>}
          </p>
          {vendor.available && (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-success">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Available
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
