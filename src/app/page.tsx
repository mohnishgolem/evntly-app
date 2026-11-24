import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";
import { ArrowRight, CalendarCheck, FileText, MapPin, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VendorCard } from "@/components/vendor-card";
import { HeroVideo } from "@/components/hero-video";
import { VendorMapLoader } from "@/components/vendor-map-loader";
import { HeroSearch } from "@/components/home/hero-search";
import { CategoryRail } from "@/components/home/category-rail";
import { getFeaturedVendors, launchCity } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { continuePlanning, recentlyViewedVendors } from "@/lib/data/customer-home";
import { navRole } from "@/lib/nav";
import { CategoryArt } from "@/components/category-art";
import type { Metadata } from "next";
import { FEATURED_CATEGORIES, LAUNCH_CITY, VENDOR_CATEGORIES, categoryPlural, isLaunchCategory } from "@/lib/config";
import { serializeJsonLd } from "@/lib/json-ld";
import { categoryPath, organizationJsonLd, pageMetadata, websiteJsonLd } from "@/lib/seo";
import { FEE_SUMMARY } from "@/lib/vendor-terms";

const HOME_TITLE = `Evntly | Find & Book Event Vendors in ${LAUNCH_CITY}`;
// Brand first so searches for "Evntly" match the title; the categories
// named are ones with real listings. Customers book and pay vendors
// directly (online payments are off).
const HOME_DESCRIPTION = `Discover ${LAUNCH_CITY} photographers, DJs, caterers, videographers and more on Evntly. Browse event vendors, request quotes and book directly.`;

export const metadata: Metadata = {
  ...pageMetadata({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/", socialTitle: "Evntly — Find trusted event vendors" }),
  title: { absolute: HOME_TITLE },
};

// The customer steps from /how-it-works, word for word (first four).
const STEPS = [
  { icon: Sparkles, title: "Tell us about your event", body: "Start Planning sets up an event board with the services you need and vendors that match. No account needed to start." },
  { icon: Search, title: "Find vendors", body: `Browse photographers, decorators, DJs, celebrants and more in ${LAUNCH_CITY}, with real reviews from completed bookings.` },
  { icon: FileText, title: "Request quotes", body: "Ask several vendors for a price. Each replies with an itemised quote, including deposit and cancellation terms." },
  { icon: CalendarCheck, title: "Accept and book", body: "Compare quotes and accept the one you want. The vendor then confirms the booking to lock in your date." },
];

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function HomePage() {
  const popular = VENDOR_CATEGORIES.filter((c) => FEATURED_CATEGORIES.includes(c.value));

  return (
    <div className="bg-canvas pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd([organizationJsonLd(), websiteJsonLd()]) }}
      />

      {/* Hero: full-bleed photography, one message, search front and centre. */}
      {/* Phones: a short hero so vendors are a thumb-flick away. Wider: full-bleed. */}
      <section className="relative isolate flex min-h-[340px] items-end overflow-hidden px-4 pt-20 pb-6 md:min-h-[680px] md:items-center md:pt-24 md:pb-24">
        {/* Poster stays underneath: it's the LCP image, the loading fallback, and what
            reduced-motion users see instead of the video. */}
        <Image
          src="/images/hero-celebrations-poster.jpg"
          alt="A couple sharing their first dance under a canopy of fairy lights"
          fill
          priority
          sizes="100vw"
          className="-z-30 object-cover"
        />
        {/* Layers, back to front: poster, video, shade, content. */}
        <div className="absolute inset-0 -z-20">
          <HeroVideo
            src="/videos/hero-celebrations.mp4"
            mobileSrc="/videos/hero-celebrations-mobile.mp4"
            poster="/images/hero-celebrations-poster.jpg"
          />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/35 to-black/75" />

        <div className="mx-auto w-full max-w-5xl text-center">
          <p className="text-eyebrow hidden text-white/80 md:block">Event vendors in {launchCity}</p>
          <h1 className="mx-auto max-w-4xl text-[2rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance text-white md:mt-4 md:text-display">
            Find the right vendors for your next event
          </h1>
          <p className="mx-auto mt-5 hidden max-w-xl text-lg leading-relaxed text-balance text-white/85 md:block">
            Find photographers, DJs, decorators, celebrants and more. Request quotes and book directly.
          </p>
          <HeroSearch className="mx-auto mt-5 max-w-4xl md:mt-10" />
          <div className="mt-5 hidden flex-wrap items-center justify-center gap-x-1 gap-y-2 text-sm text-white/85 md:flex">
            <span className="mr-1">Popular:</span>
            {popular.map((c) => (
              <Link
                key={c.value}
                href={isLaunchCategory(c.value) ? categoryPath(c.value) : `/explore?category=${c.value}`}
                className="rounded-full px-2.5 py-1 font-medium text-white underline-offset-4 transition-colors hover:bg-white/15 hover:underline"
              >
                {title(categoryPlural(c.value))}
              </Link>
            ))}
            <Link href="/plan" className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/25">
              Plan my event <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section aria-labelledby="categories-heading" className="mt-6 md:mt-20">
          <SectionHeader id="categories-heading" eyebrow="Browse" title="What do you need?" href="/explore" linkLabel="All vendors" />
          <CategoryRail />
        </section>

        {/* Signed-in customers: their events and recently viewed vendors. */}
        <Suspense>
          <ForYou />
        </Suspense>

        {/* The hero and categories need no data, so they paint straight away; vendors stream in. */}
        <Suspense fallback={<HomeVendorsSkeleton />}>
          <HomeVendors />
        </Suspense>

        <section aria-labelledby="how-heading" className="mt-20 md:mt-28">
          <SectionHeader id="how-heading" eyebrow="How it works" title="From idea to booked, in four steps" href="/how-it-works" linkLabel="Learn more" />
          {/* Phones: swipe through the steps; wider: a grid. */}
          <ol className="rail -mx-4 auto-cols-[82%] gap-3 px-4 sm:mx-0 sm:grid sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="surface-raised rounded-card p-6">
                <div className="flex items-center justify-between">
                  <span className="btn-raised flex size-11 items-center justify-center rounded-2xl">
                    <s.icon className="size-5 text-primary" strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground tabular-nums">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-headline">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <Button size="lg" nativeButton={false} render={<Link href="/plan">Start planning</Link>} />
          </div>
        </section>

        <section aria-labelledby="vendors-heading" className="mt-20 overflow-hidden rounded-[2rem] bg-[#141416] text-white md:mt-28">
          <div className="grid items-center gap-8 p-8 md:grid-cols-[1.2fr_1fr] md:p-14">
            <div>
              <p className="text-eyebrow text-primary">For event businesses</p>
              <h2 id="vendors-heading" className="mt-3 text-title text-balance">
                Get found by people planning events in {launchCity}
              </h2>
              <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-white/75">{FEE_SUMMARY}</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" nativeButton={false} render={<Link href="/founding-vendors">List your business</Link>} />
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/10 hover:text-white dark:border-white/25 dark:bg-white/[0.06]"
                  nativeButton={false}
                  render={<Link href="/how-it-works">How it works for vendors</Link>}
                />
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-3 text-sm">
              {["Your own profile, photos and packages", "Quote requests with the details up front", "Message customers on Evntly", "Founding Vendor badge for the first 200"].map((t) => (
                <li key={t} className="rounded-2xl bg-gradient-to-b from-white/[0.09] to-white/[0.03] p-4 leading-snug text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-white/10">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ id, eyebrow, title, href, linkLabel }: { id: string; eyebrow: string; title: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className="text-eyebrow text-primary">{eyebrow}</p>
        <h2 id={id} className="mt-2 text-title">
          {title}
        </h2>
      </div>
      <Link
        href={href}
        className="group btn-raised hidden shrink-0 items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold sm:inline-flex"
      >
        {linkLabel}
        <ArrowRight className="size-4 transition-transform duration-300 ease-standard group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

// Returning customers: pick up an event where they left off, and get back to
// vendors they were looking at. Nothing renders for guests or new customers.
async function ForYou() {
  const session = await getCurrentUser();
  if (!session || navRole(session.profile?.role, true) !== "customer") return null;
  const [plans, recent] = await Promise.all([continuePlanning(session.user.id, 3), recentlyViewedVendors(session.user.id, 8)]);
  if (plans.length === 0 && recent.length === 0) return null;
  const savedVendorIds = session.profile?.saved_providers ?? [];

  return (
    <>
      {plans.length > 0 && (
        <section aria-labelledby="continue-heading" className="mt-12 md:mt-20">
          <SectionHeader id="continue-heading" eyebrow="Your events" title="Continue planning" href="/dashboard/events" linkLabel="All events" />
          <ul className="rail -mx-4 auto-cols-[86%] gap-3 px-4 pt-1 pb-4 sm:mx-0 sm:grid sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/events/${p.id}`} className="surface-raised lift flex h-full items-center gap-4 rounded-card p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl [background:var(--gradient-tile)]">
                    <CategoryArt value={p.openService ?? "event_planner"} className="size-12 drop-shadow-[0_4px_4px_rgba(28,25,23,0.16)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {formatEventDate(p.date)}
                      {p.suburb ? ` · ${p.suburb}` : ""}
                    </span>
                    {p.total > 0 ? (
                      <span className="mt-2 block">
                        <span className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {p.done} of {p.total} vendors booked
                          </span>
                          <span className="tabular-nums">{p.percent}%</span>
                        </span>
                        <span className="surface-pressed mt-1 block h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label="Vendors booked" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent}>
                          <span className="block h-full rounded-full [background:var(--gradient-coral)]" style={{ width: `${Math.max(p.percent, 4)}%` }} />
                        </span>
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs font-medium text-primary">Add the services you need</span>
                    )}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="mt-12 md:mt-20">
          <SectionHeader id="recent-heading" eyebrow="Pick up where you left off" title="Recently viewed" href="/saved" linkLabel="Saved vendors" />
          <div className="rail -mx-4 auto-cols-[44%] gap-3 px-4 pt-1 pb-4 sm:mx-0 sm:auto-cols-[calc((100%-3*1.25rem)/4)] sm:gap-5 sm:px-0 lg:auto-cols-[calc((100%-5*1.25rem)/6)]">
            {recent.map((v) => (
              <VendorCard key={v.id} vendor={v} saved={savedVendorIds.includes(v.id)} isAuthenticated />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function formatEventDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

async function HomeVendors() {
  const [vendors, session] = await Promise.all([getFeaturedVendors(8), getCurrentUser()]);
  const savedVendorIds = session?.profile?.saved_providers ?? [];

  if (vendors.length === 0) {
    return (
      <section className="mt-16 rounded-3xl border border-dashed border-border py-16 text-center">
        <p className="text-headline">No vendors listed yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          We&apos;re curating our first {launchCity} vendors. Check back soon, or{" "}
          <Link href="/signup?role=vendor" className="underline underline-offset-2">
            list your business
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <>
      <section aria-labelledby="featured-heading" className="mt-12 md:mt-28">
        <SectionHeader id="featured-heading" eyebrow="Featured" title={`Vendors in ${launchCity}`} href="/explore" linkLabel="Show all" />
        {/* Phones: a swipeable rail. Wider: a grid. */}
        <div className="rail -mx-4 auto-cols-[80%] gap-4 px-4 pt-1 pb-4 sm:mx-0 sm:pt-0 sm:pb-0 sm:grid sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {vendors.map((v, i) => (
            <VendorCard key={v.id} vendor={v} saved={savedVendorIds.includes(v.id)} isAuthenticated={!!session} priority={i < 4} />
          ))}
        </div>
        <Link
          href="/explore"
          className="btn-raised mt-4 flex h-12 items-center justify-center gap-1 rounded-full text-[15px] font-semibold sm:hidden"
        >
          Show all vendors <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <section aria-labelledby="map-heading" className="mt-20 md:mt-28">
        <SectionHeader id="map-heading" eyebrow="Nearby" title="Find vendors near you" href="/explore?view=map" linkLabel="Open full map" />
        <div className="surface-raised relative h-80 overflow-hidden rounded-[2rem] md:h-[26rem]">
          <VendorMapLoader vendors={vendors} embedded deferUntilVisible />
          <Link
            href="/explore?view=map"
            className="btn-raised absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold whitespace-nowrap"
          >
            <MapPin className="size-4" aria-hidden /> Open full map
          </Link>
        </div>
      </section>
    </>
  );
}

// Same footprint as the cards and map, so nothing jumps when they arrive.
function HomeVendorsSkeleton() {
  return (
    <div aria-hidden>
      <section className="mt-20 md:mt-28">
        <div className="mb-6 h-14 w-72 max-w-full rounded-xl bg-muted" />
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted sm:aspect-square" />
          ))}
        </div>
      </section>
      <section className="mt-20 md:mt-28">
        <div className="mb-6 h-14 w-72 max-w-full rounded-xl bg-muted" />
        <div className="h-80 animate-pulse rounded-[2rem] bg-muted md:h-[26rem]" />
      </section>
    </div>
  );
}
