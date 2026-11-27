import { Camera, Lock, MapPin, MessageCircle } from "lucide-react";
import { CategoryArt } from "@/components/category-art";
import { FoundingBadge } from "@/components/founding-badge";
import { categoryLabel, LAUNCH_CITY } from "@/lib/config";
import { priceSummary } from "@/lib/pricing-model";
import { cn } from "@/lib/utils";
import { approvedPackages, type ListingDraft } from "@/lib/vendor-journey/draft";
import { formatAud } from "@/lib/vendor-journey/scenario";

// How the vendor's profile will look to customers, built only from their own
// answers. Empty answers show a soft placeholder ("Your business name"), never
// made-up content. Always labelled private: nothing here is public.

export function ListingPreview({ draft, className, compact = false }: { draft: ListingDraft; className?: string; compact?: boolean }) {
  const name = draft.businessName.trim();
  const price = priceSummary({ pricing_model: draft.pricingModel, hourly_rate: draft.hourlyRate, base_price: draft.basePrice });
  const packages = approvedPackages(draft);
  const paragraphs = draft.bio.trim().split(/\n{2,}/).filter(Boolean);

  return (
    <article aria-label="Listing preview" className={cn("overflow-hidden rounded-card bg-background shadow-[var(--shadow-float)] ring-1 ring-border/60", className)}>
      <div className="relative aspect-[16/10] bg-gradient-to-br from-secondary to-muted">
        {draft.serviceType ? (
          <CategoryArt value={draft.serviceType} className="absolute inset-0 m-auto size-24 opacity-90" />
        ) : null}
        <FoundingBadge className="absolute top-3 left-3" />
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium">
          <Lock className="size-3" aria-hidden /> Private preview
        </span>
        <span className="absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-background/85 px-3 py-1.5 text-xs text-muted-foreground">
          <Camera className="size-3.5" aria-hidden /> Your photos go here once you&apos;ve saved
        </span>
      </div>

      <div className={cn("space-y-4", compact ? "p-4" : "p-5")}>
        <header>
          <h2 className={cn("text-[20px] leading-tight font-bold", !name && "text-muted-foreground")}>{name || "Your business name"}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[15px] text-muted-foreground">
            <span>{draft.serviceType ? categoryLabel(draft.serviceType) : "Your category"}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-3.5" aria-hidden />
              {draft.city.trim() || LAUNCH_CITY}
            </span>
          </p>
          <p className="mt-2 text-[17px] font-semibold">
            {draft.pricingModel === "quote" ? "Custom quotes" : price ? price[0].toUpperCase() + price.slice(1) : <span className="text-muted-foreground">Your starting price</span>}
          </p>
        </header>

        {draft.eventTypes.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Events">
            {draft.eventTypes.map((t) => (
              <li key={t} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                {t}
              </li>
            ))}
          </ul>
        )}

        <section>
          <h3 className="text-sm font-semibold">About</h3>
          {paragraphs.length ? (
            paragraphs.map((p, i) => (
              <p key={i} className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-line text-foreground/85">
                {p}
              </p>
            ))
          ) : (
            <p className="mt-1.5 text-[15px] text-muted-foreground">A few lines about your business and style.</p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Packages</h3>
          {packages.length ? (
            <ul className="mt-2 space-y-2">
              {packages.map((p) => (
                <li key={p.name} className="rounded-2xl bg-secondary p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{p.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatAud(p.price ?? 0)}</span>
                  </div>
                  {p.includedHours ? <p className="text-xs text-muted-foreground">{p.includedHours} hours</p> : null}
                  {p.inclusions.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-[13px] text-muted-foreground">
                      {p.inclusions.map((inc) => (
                        <li key={inc}>{inc}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[15px] text-muted-foreground">Your first package, with your price.</p>
          )}
        </section>

        <div className="flex items-center justify-center gap-2 rounded-full [background:var(--gradient-coral-strong)] px-4 py-3 text-[15px] font-semibold text-primary-foreground opacity-90" aria-hidden>
          <MessageCircle className="size-4" /> Request a quote
        </div>
        <p className="text-center text-xs text-muted-foreground">Customers send you their event details. You reply with a quote.</p>
      </div>
    </article>
  );
}
