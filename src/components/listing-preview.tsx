import { ImageIcon, Package } from "lucide-react";
import { MIN_PHOTOS } from "@/lib/listing-completion";
import type { PublicPortfolioItem } from "@/lib/public-columns";
import { cn } from "@/lib/utils";

// "How customers will see you": the vendor's own listing as a customer card,
// with empty slots for what's missing. It shows the payoff of finishing (the
// photos and a price customers compare on) instead of only a to-do list.
// Server component: formatted prices are passed in as text.
export function ListingPreview({
  name,
  category,
  priceLabel,
  photos,
  firstPackage,
  complete,
  city,
  offerSetup = false,
}: {
  name: string;
  category: string;
  city: string;
  /** Link to the "Set it up for me" form further down the page. */
  offerSetup?: boolean;
  priceLabel: string;
  photos: PublicPortfolioItem[];
  /** e.g. "4-hour DJ set · $600", or null while there's no package. */
  firstPackage: string | null;
  complete: boolean;
}) {
  const slots = Array.from({ length: MIN_PHOTOS }, (_, i) => photos[i] ?? null);
  return (
    <section aria-labelledby="preview-heading" className="rounded-2xl border border-border p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="preview-heading" className="font-semibold">
          How customers will see you
        </h2>
        <span className={cn("text-xs font-medium", complete ? "text-success" : "text-muted-foreground")}>
          {complete ? "Looking good" : "Preview"}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border">
        <div className="grid grid-cols-3 gap-0.5 bg-border">
          {slots.map((item, i) =>
            item ? (
              item.media_type === "video" ? (
                <video key={item.id} src={item.media_url} muted playsInline preload="metadata" className="aspect-square h-full w-full bg-black object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={item.id} src={item.media_url} alt="" className="aspect-square h-full w-full object-cover" />
              )
            ) : (
              <a
                key={`empty-${i}`}
                href="#photos"
                className="flex aspect-square flex-col items-center justify-center gap-1 bg-muted text-muted-foreground outline-none hover:bg-muted/70 focus-visible:bg-muted/70"
              >
                <ImageIcon className="size-5" strokeWidth={1.75} aria-hidden />
                <span className="text-xs">Photo {i + 1}</span>
              </a>
            )
          )}
        </div>
        <div className="space-y-1 p-3">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-sm text-muted-foreground">
            {category} · {city} · {priceLabel}
          </p>
          {firstPackage ? (
            <p className="flex items-center gap-1.5 text-sm">
              <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{firstPackage}</span>
            </p>
          ) : (
            <a href="#packages" className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline">
              <Package className="size-4 shrink-0" aria-hidden />
              Your first package shows here
            </a>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {complete
          ? "This is what customers compare when they look for a vendor."
          : "Customers scroll past listings without photos or a price to compare. Fill the gaps below and you're ready."}
        {offerSetup && !complete && (
          <>
            {" "}
            Busy?{" "}
            <a href="#setup" className="font-medium text-foreground underline underline-offset-2">
              We can set it up for you
            </a>
            .
          </>
        )}
      </p>
    </section>
  );
}
