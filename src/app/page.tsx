import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VendorCard } from "@/components/vendor-card";
import { VendorMapLoader } from "@/components/vendor-map-loader";
import { getFeaturedVendors, launchCity } from "@/lib/data/vendors";
import { LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";

const HERO_SCENARIOS = ["Weddings", "Birthdays", "Corporate events", "Engagements"];

export default async function HomePage() {
  const vendors = await getFeaturedVendors(8);
  const launchVendorCategories = VENDOR_CATEGORIES.filter((c) =>
    LAUNCH_CATEGORIES.includes(c.value)
  );

  return (
    <div className="pb-16">
      {/* Hero — one clear message, one primary CTA, one secondary. No sign-up wall. */}
      <section className="border-b border-border/40 bg-gradient-to-b from-primary/5 to-background px-4 py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold tracking-wide text-coral uppercase">
            For {launchCity} event planners
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-balance md:text-6xl">
            Find the right vendors for your next event
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground text-balance">
            Browse trusted {launchVendorCategories.map((c) => c.label.toLowerCase()).join(", ")}{" "}
            for your {HERO_SCENARIOS.join(", ").toLowerCase()} — no account needed to look around.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="h-12 px-8 text-base"
              nativeButton={false}
              render={<Link href="/plan">Start planning</Link>}
            />
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-8 text-base"
              nativeButton={false}
              render={<Link href="/explore">Browse vendors</Link>}
            />
          </div>
        </div>

        <div className="mx-auto mt-12 flex max-w-3xl flex-wrap justify-center gap-3">
          {launchVendorCategories.map((c) => (
            <Link
              key={c.value}
              href={`/explore?category=${c.value}`}
              className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-coral/40 hover:text-coral"
            >
              <span>{c.icon}</span>
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        {vendors.length > 0 && (
          <section className="mt-12">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xl font-bold">Explore vendors near you</h2>
              <Link
                href="/explore?view=map"
                className="flex items-center gap-1 text-sm font-semibold underline underline-offset-2 hover:text-primary"
              >
                Open full map <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Discover event vendors available in your area
            </p>
            <div className="relative h-72 overflow-hidden rounded-3xl border border-border shadow-[0_4px_20px_rgba(15,23,42,0.06)]">
              <VendorMapLoader vendors={vendors} embedded />
              <Link
                href="/explore?view=map"
                className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold whitespace-nowrap text-background shadow-lg transition-colors hover:bg-foreground/90"
              >
                <MapPin className="h-4 w-4" /> Open full map
              </Link>
            </div>
          </section>
        )}

        {vendors.length > 0 ? (
          <section className="mt-12">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">Top rated vendors in {launchCity}</h2>
              <Link
                href="/explore"
                className="flex items-center gap-1 text-sm font-semibold underline underline-offset-2 hover:text-primary"
              >
                Show all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
              {vendors.map((v) => (
                <VendorCard key={v.id} vendor={v} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-16 rounded-2xl border border-dashed border-border py-16 text-center">
            <p className="text-lg font-semibold">No vendors listed yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              We&apos;re curating our first {launchCity} vendors. Check back soon, or{" "}
              <Link href="/signup?role=vendor" className="underline underline-offset-2">
                list your business
              </Link>
              .
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
