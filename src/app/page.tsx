import Link from "next/link";
import Image from "next/image";
import { ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VendorCard } from "@/components/vendor-card";
import { VendorMapLoader } from "@/components/vendor-map-loader";
import { getFeaturedVendors, launchCity } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";

const HERO_SCENARIOS = ["Weddings", "Birthdays", "Corporate events", "Engagements"];

export default async function HomePage() {
  const [vendors, session] = await Promise.all([getFeaturedVendors(8), getCurrentUser()]);
  const savedVendorIds = session?.profile?.saved_providers ?? [];
  const launchVendorCategories = VENDOR_CATEGORIES.filter((c) =>
    LAUNCH_CATEGORIES.includes(c.value)
  );

  return (
    <div className="pb-16">
      {/* Hero — one clear message, one primary CTA, one secondary. No sign-up wall. */}
      <section className="relative overflow-hidden border-b border-border/40 px-4 py-20 md:py-28">
        {/* Poster stays underneath: it's the LCP image, the loading fallback, and what
            reduced-motion users see instead of the video. */}
        <Image
          src="/images/hero-celebrations-poster.jpg"
          alt="A couple sharing their first dance under a canopy of fairy lights"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <video
          src="/videos/hero-celebrations.mp4"
          poster="/images/hero-celebrations-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/50 to-black/75" />

        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold tracking-wide text-highlight uppercase">
            For {launchCity} event planners
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-balance text-white md:text-6xl">
            Find the right vendors for your next event
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-balance text-white/85">
            Browse trusted {launchVendorCategories.map((c) => c.label.toLowerCase()).join(", ")}{" "}
            for your {HERO_SCENARIOS.join(", ").toLowerCase()} — no account needed to look around.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="h-12 px-8 text-base shadow-lg"
              nativeButton={false}
              render={<Link href="/plan">Start planning</Link>}
            />
            <Button
              size="lg"
              variant="outline"
              className="h-12 border-white/40 bg-white/90 px-8 text-base text-neutral-900 shadow-lg backdrop-blur-sm hover:bg-white hover:text-neutral-900 dark:border-white/40 dark:bg-white/90 dark:text-neutral-900 dark:hover:bg-white dark:hover:text-neutral-900"
              nativeButton={false}
              render={<Link href="/explore">Browse vendors</Link>}
            />
          </div>
        </div>

        <div className="relative mx-auto mt-12 flex max-w-3xl flex-wrap justify-center gap-3">
          {launchVendorCategories.map((c) => (
            <Link
              key={c.value}
              href={`/explore?category=${c.value}`}
              className="flex items-center gap-2 rounded-full border border-white/40 bg-white/90 px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm backdrop-blur-sm transition-colors hover:border-highlight/40 hover:text-highlight"
            >
              <c.icon className="size-4" />
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
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
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {vendors.map((v) => (
                <VendorCard
                  key={v.id}
                  vendor={v}
                  saved={savedVendorIds.includes(v.id)}
                  isAuthenticated={!!session}
                />
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
