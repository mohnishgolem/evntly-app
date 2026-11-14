import type { Metadata } from "next";
import Link from "next/link";
import { Award, CalendarCheck, Camera, Check, FileText, MessageCircle, Search, Store, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FoundingBadge } from "@/components/founding-badge";
import { SourceCookie } from "@/components/founding/source-cookie";
import { WaitlistForm } from "@/components/founding/waitlist-form";
import { ClaimLink } from "@/components/founding/claim-link";
import { getFoundingPlaces, getSampleListing, type SampleListing } from "@/lib/data/founding";
import { landingVariant } from "@/lib/founding/landing-variants";
import { categoryLabel } from "@/lib/config";
import { getCurrentUser } from "@/lib/data/user";
import { navRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { CLAIM_PATH, referralFromParams, sourceFromParams } from "@/lib/founding/sources";
import { LAUNCH_CITY } from "@/lib/config";

export const metadata: Metadata = {
  title: "Founding vendors — private beta",
  description: `Get found by people planning events in ${LAUNCH_CITY}. Founding Vendors get a free listing, a Founding Vendor badge and first spot in search.`,
  alternates: { canonical: "/founding-vendors" },
  openGraph: {
    title: "Become an Evntly Founding Vendor",
    description: `Limited Founding Vendor places for ${LAUNCH_CITY} event vendors. Free to take part.`,
  },
};

type Point = { icon: LucideIcon; title: string; body: string };

// Keep these in step with the Meta ads and Instagram posts: people arrive here
// expecting exactly these four things. Every one must be real and enforced.
const PERKS: Point[] = [
  { icon: Store, title: "Free listing", body: "Your business profile, photos, prices and service area, with no subscription fee during the beta." },
  { icon: Award, title: "Founding Vendor badge", body: "Shown on your profile, your card in search results and the map." },
  { icon: Search, title: "Listed first in search", body: "Founding Vendors appear ahead of other vendors in Evntly search results." },
  { icon: Camera, title: "Featured on @evntly.au", body: "We'll introduce your business on our Instagram when your listing goes live." },
];

const STEPS: Point[] = [
  { icon: Users, title: "Claim your account", body: "Sign up, or log in if you already have an Evntly account. You'll confirm your email." },
  { icon: FileText, title: "Create your listing", body: "Business name, category, the Sydney areas you service, contact details and your portfolio." },
  { icon: CalendarCheck, title: "We review it", body: "Our team checks every listing. You'll see your status (Pending, Approved or Needs changes) and we'll email you." },
  { icon: MessageCircle, title: "Go live", body: "Once approved, your listing goes live with the Founding Vendor badge. Tell us what works and what doesn't from your dashboard." },
];

const FAQ = [
  {
    q: "Who can join?",
    a: `Event vendors based in ${LAUNCH_CITY} with an ABN: photographers, decorators, DJs, celebrants, florists, caterers, videographers, MCs, makeup artists and event planners.`,
  },
  {
    q: "Does it cost anything?",
    a: "No. Taking part in the beta is free and there's no subscription fee. Your listing is covered by the Vendor Service Agreement you accept when you list.",
  },
  {
    q: "I already have an Evntly account.",
    a: "You don't need to register again. Log in and claim your place — we'll use your existing listing, or help you create one.",
  },
  {
    q: "Is a place guaranteed?",
    a: "Founding Vendor places are limited. Every listing is reviewed by our team, and a place is confirmed when we approve your application. Evntly can't guarantee enquiries or bookings.",
  },
  {
    q: "How do payments work?",
    a: "Online payments are switched off during the beta. Customers pay vendors directly, on the terms in your quote.",
  },
  {
    q: "What if the places are full?",
    a: "Join the waitlist and we'll email you if a place opens up.",
  },
];

// Said in the first screen: most ad visitors had never heard of Evntly.
const WHAT_EVNTLY_IS = `Evntly is a ${LAUNCH_CITY} marketplace where people planning events browse vendors by category and area, then send you a quote request. You reply in Evntly, and customers pay you directly.`;

// The Vendor Service Agreement, Schedule 1 (fees). Keep in step with it.
const DEAL_TERMS =
  "Free: no subscription, no commission and no booking fees. If we ever add a fee, you'll get 30 days' notice and it only applies if you accept it.";

export default async function FoundingVendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const source = sourceFromParams(params);
  const referral = referralFromParams(params);
  const variant = landingVariant(params);
  const [places, session, sample] = await Promise.all([
    getFoundingPlaces(),
    getCurrentUser(),
    getSampleListing(variant?.category ?? null),
  ]);
  const role = navRole(session?.profile?.role, !!session);
  const hasTabBar = role === "customer" || role === "vendor";
  const full = places ? places.remaining <= 0 : false;
  const claimQuery = new URLSearchParams();
  if (source) claimQuery.set("src", source);
  if (referral) claimQuery.set("ref", referral);
  const claimPage = claimQuery.size ? `${CLAIM_PATH}?${claimQuery}` : CLAIM_PATH;
  // Signed-out visitors go straight to the vendor sign-up form (it returns to
  // the claim page afterwards); the claim page in between was an extra tap
  // that most ad visitors never got past. Signed-in visitors claim directly.
  const claimHref = session ? claimPage : `/signup?role=vendor&next=${encodeURIComponent(claimPage)}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <SourceCookie source={source} referral={referral} />

      <header className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          {variant ? variant.eyebrow : `Founding Vendors · ${LAUNCH_CITY}`}
        </p>
        <h1 className="mt-3 text-[32px] leading-tight font-bold tracking-tight text-balance sm:text-[48px]">
          {variant ? variant.headline : `Get found by people planning events in ${LAUNCH_CITY}`}
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
          {WHAT_EVNTLY_IS}
        </p>

        <ul className="mx-auto mt-6 grid max-w-md gap-2.5 text-left text-[16px]">
          {PERKS.map((p) => (
            <li key={p.title} className="flex items-center gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-4" strokeWidth={3} aria-hidden />
              </span>
              <span className="font-medium">{p.title}</span>
            </li>
          ))}
        </ul>

        <PlacesMeter places={places} />
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{DEAL_TERMS}</p>

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          {full ? (
            <Button size="lg" nativeButton={false} render={<a href="#waitlist">Join the Waitlist</a>} />
          ) : (
            <Button size="lg" nativeButton={false} render={<ClaimLink href={claimHref}>{CLAIM_LABEL}</ClaimLink>} />
          )}
          <Button size="lg" variant="outline" nativeButton={false} render={<a href="#how-it-works">How it works</a>} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Already on Evntly?{" "}
          <Link href={`/login?next=${encodeURIComponent(claimPage)}`} className="font-medium text-foreground underline underline-offset-2">
            Log in to claim your place
          </Link>
        </p>
      </header>

      <section aria-labelledby="what-heading" className="mt-16">
        <h2 id="what-heading" className="text-2xl font-bold tracking-tight sm:text-[32px]">
          What Founding Vendors get
        </h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
          <ul className="grid gap-3 sm:grid-cols-2">
            {PERKS.map((p) => (
              <li key={p.title} className="flex gap-4 rounded-2xl bg-secondary p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-background text-primary shadow-sm">
                  <p.icon className="size-[22px]" strokeWidth={1.75} aria-hidden />
                </span>
                <span>
                  <span className="block text-[17px] font-semibold">{p.title}</span>
                  <span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <BadgePreview sample={sample} />
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how-heading" className="mt-16 scroll-mt-24">
        <h2 id="how-heading" className="text-2xl font-bold tracking-tight sm:text-[32px]">
          How it works
        </h2>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col rounded-2xl border border-border p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  <s.icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-sm font-semibold text-muted-foreground tabular-nums">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold">{s.title}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        {!full && (
          <div className="mt-6">
            <Button size="lg" className="w-full sm:w-auto" nativeButton={false} render={<ClaimLink href={claimHref}>{CLAIM_LABEL}</ClaimLink>} />
          </div>
        )}
      </section>

      {!full && (
        <section id="help" aria-labelledby="help-heading" className="mt-16 scroll-mt-24 rounded-3xl border border-border p-6 sm:p-8">
          <h2 id="help-heading" className="text-2xl font-bold tracking-tight">
            Prefer some help?
          </h2>
          <p className="mt-2 mb-6 max-w-2xl text-[15px] text-muted-foreground">
            Leave your details and your Instagram or website. We&apos;ll look at your work and email you to set up your
            listing together. It&apos;s still free.
          </p>
          <WaitlistForm assisted submitLabel="Ask for help" />
        </section>
      )}

      <section id="waitlist" aria-labelledby="waitlist-heading" className="mt-16 scroll-mt-24 rounded-3xl border border-border p-6 sm:p-8">
        <h2 id="waitlist-heading" className="text-2xl font-bold tracking-tight">
          {full ? "All Founding Vendor places are taken — join the waitlist" : "Not ready yet? Join the waitlist"}
        </h2>
        <p className="mt-2 mb-6 max-w-2xl text-[15px] text-muted-foreground">
          {full
            ? "We'll email you if a founding place opens up, and when Evntly opens to more vendors."
            : "Leave your details and we'll email you about vendor early access."}
        </p>
        <WaitlistForm />
      </section>

      <section aria-labelledby="faq-heading" className="mt-16">
        <h2 id="faq-heading" className="text-2xl font-bold tracking-tight sm:text-[32px]">
          Questions
        </h2>
        <div className="mt-6 divide-y divide-border rounded-2xl border border-border">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                {f.q}
                <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <FounderNote />

      <p className="mt-6 text-center text-[15px] text-muted-foreground">
        Questions about the beta? Email{" "}
        <a href="mailto:hello@evntlyapp.com" className="font-medium text-foreground underline underline-offset-2">
          hello@evntlyapp.com
        </a>
      </p>

      {!full && <StickyClaim href={claimHref} hasTabBar={hasTabBar} />}
    </div>
  );
}

const CLAIM_LABEL = "Claim my free listing";

// Phones: the hero button scrolls away fast, so keep it in reach. Sits above
// the tab bar for signed-in customers and vendors (same offset as the
// vendor profile's booking bar).
function StickyClaim({ href, hasTabBar }: { href: string; hasTabBar: boolean }) {
  return (
    <>
      <div aria-hidden className="h-20 sm:hidden print:hidden" />
      <div
        className={cn(
          "glass-material fixed inset-x-0 z-30 border-t border-border/60 px-4 py-3 sm:hidden print:hidden",
          hasTabBar
            ? "bottom-[calc(3.5rem+max(0.5rem,env(safe-area-inset-bottom)))]"
            : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        )}
      >
        <Button size="lg" className="w-full" nativeButton={false} render={<ClaimLink href={href}>{CLAIM_LABEL}</ClaimLink>} />
      </div>
    </>
  );
}

// What a listing card with the badge looks like, using one of Evntly's own
// sample listings (clearly labelled) so it isn't read as a real vendor.
function BadgePreview({ sample }: { sample: SampleListing | null }) {
  return (
    <figure className="rounded-2xl border border-border p-4">
      <div className="relative aspect-[5/3] overflow-hidden rounded-xl bg-gradient-to-br from-secondary to-muted lg:aspect-[4/3]">
        {sample && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sample.avatarUrl} alt="" className="h-full w-full object-cover" />
        )}
        <FoundingBadge className="absolute top-3 left-3" />
        <span className="absolute top-3 right-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium">Sample listing</span>
      </div>
      <div className="mt-3">
        <p className="text-[17px] font-semibold">{sample ? sample.name : "Your business name"}</p>
        <p className="text-[15px] text-muted-foreground">
          {sample ? `${categoryLabel(sample.category)} · ${sample.city ?? LAUNCH_CITY}` : "Photographer · Parramatta"}
          {sample?.hourlyRate ? ` · from $${Math.round(sample.hourlyRate)}/hr` : ""}
        </p>
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        Example only: one of Evntly&apos;s sample listings, showing how the Founding Vendor badge appears on your card.
      </figcaption>
    </figure>
  );
}

// Who's behind it. A new marketplace asks vendors to trust someone they've
// never heard of, so say plainly who runs it and how to reach them.
function FounderNote() {
  return (
    <section aria-label="Who runs Evntly" className="mx-auto mt-16 max-w-2xl rounded-2xl bg-secondary p-6 text-[15px] leading-relaxed">
      <p>
        Evntly is a {LAUNCH_CITY} business run by Mohnish. Every listing is checked by a person before it goes live, and
        you can reach us at{" "}
        <a href="mailto:hello@evntlyapp.com" className="font-medium underline underline-offset-2">
          hello@evntlyapp.com
        </a>{" "}
        or{" "}
        <a href="https://www.instagram.com/evntly.au/" className="font-medium underline underline-offset-2">
          @evntly.au
        </a>{" "}
        on Instagram.
      </p>
    </section>
  );
}

// Below this many approved vendors the meter reads as "nobody has joined",
// which puts vendors off; show the plain line until there's some proof.
const PLACES_METER_MIN_APPROVED = 5;

function PlacesMeter({ places }: { places: Awaited<ReturnType<typeof getFoundingPlaces>> }) {
  if (!places || (places.approved < PLACES_METER_MIN_APPROVED && places.remaining > 0)) {
    return <p className="mt-6 text-[15px] font-medium">Founding Vendor places are limited</p>;
  }
  const { capacity, approved, remaining } = places;
  const percent = capacity ? Math.min(100, Math.round((approved / capacity) * 100)) : 100;
  return (
    <div className="mx-auto mt-7 max-w-sm text-left">
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-semibold">
          {remaining > 0 ? `${remaining} of ${capacity} Founding Vendor places left` : `All ${capacity} places filled`}
        </span>
        <span className="text-muted-foreground tabular-nums">{approved} approved</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Founding vendor places taken"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={approved}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
