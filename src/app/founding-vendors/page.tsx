import type { Metadata } from "next";
import Link from "next/link";
import { Award, CalendarCheck, Camera, Check, FileText, MessageCircle, Search, Store, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FoundingBadge } from "@/components/founding-badge";
import { SourceCookie } from "@/components/founding/source-cookie";
import { WaitlistForm } from "@/components/founding/waitlist-form";
import { ClaimLink } from "@/components/founding/claim-link";
import { getFoundingPlaces, getLiveVendorCount, getProofListings, getSampleListing, type ProofListing, type SampleListing } from "@/lib/data/founding";
import { landingVariant } from "@/lib/founding/landing-variants";
import { categoryLabel } from "@/lib/config";
import { getCurrentUser } from "@/lib/data/user";
import { hasPhoneTabBar, navRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { campaignFromParams, CLAIM_PATH, referralFromParams, sourceFromParams, withAutoClaim } from "@/lib/founding/sources";
import { LAUNCH_CITY } from "@/lib/config";
import { FEE_CHANGE_PROMISE, FEE_SUMMARY, PHOTO_RULE, SETUP_TIME } from "@/lib/vendor-terms";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Founding Vendors: Free Beta Listing for ${LAUNCH_CITY} Vendors`,
  description: `Get found by people planning events in ${LAUNCH_CITY}. Founding Vendors get a free listing, a Founding Vendor badge and first spot in search.`,
  alternates: { canonical: "/founding-vendors" },
  openGraph: {
    title: "Become an Evntly Founding Vendor",
    description: `Limited Founding Vendor places for ${LAUNCH_CITY} event vendors. Free to take part.`,
    url: absoluteUrl("/founding-vendors"),
    type: "website",
    siteName: "Evntly",
    locale: "en_AU",
  },
};

type Point = { icon: LucideIcon; title: string; body: string };

// Keep these in step with the Meta ads and Instagram posts: people arrive here
// expecting exactly these four things. Every one must be real and enforced.
const PERKS: Point[] = [
  { icon: Store, title: "Free listing", body: "Your business profile, photos, prices and service area. No subscription, commission or booking fees." },
  { icon: Award, title: "Founding Vendor badge", body: "Shown on your profile, your card in search results and the map." },
  { icon: Search, title: "Listed first in search", body: "Founding Vendors appear ahead of other vendors in Evntly search results." },
  { icon: Camera, title: "Featured on @evntly.au", body: "We'll introduce your business on our Instagram when your listing goes live." },
];

const STEPS: Point[] = [
  { icon: Users, title: "Claim your account", body: "Sign up, or log in if you already have an Evntly account. You'll confirm your email with a code." },
  { icon: FileText, title: "Create your listing", body: `${SETUP_TIME[0].toUpperCase()}${SETUP_TIME.slice(1)}: business name, category, your ABN, a starting rate and the Sydney areas you service. ${PHOTO_RULE}` },
  { icon: CalendarCheck, title: "We review it", body: "Our team checks every listing. You'll see your status (Pending, Approved or Needs changes) and we'll email you." },
  { icon: MessageCircle, title: "Go live", body: "Once approved, your listing goes live with the Founding Vendor badge. Tell us what works and what doesn't from your dashboard." },
];

const FAQ = [
  {
    q: "Who can join?",
    a: `Event vendors based in ${LAUNCH_CITY} with an ABN: photographers, decorators, DJs, celebrants, florists, caterers, cake and dessert makers, videographers, MCs, makeup artists and event planners.`,
  },
  {
    q: "Does it cost anything?",
    a: `No. ${FEE_SUMMARY} ${FEE_CHANGE_PROMISE} Your listing is covered by the Vendor Service Agreement you accept when you list.`,
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

// Said in the first screen: most ad visitors had never heard of Evntly. One
// sentence, so the perks and the Claim button stay near the top on a phone
// (Nov 2026: 9 in 10 ad visitors never scrolled).
const WHAT_EVNTLY_IS = `A new ${LAUNCH_CITY} marketplace where people planning events find vendors and send quote requests. Customers pay you directly.`;

// Only shown once the number says something (a count of 2 reads as empty).
const MIN_PROOF_COUNT = 5;
// The proof strip needs at least two real, complete listings to be worth showing.
const MIN_PROOF_LISTINGS = 2;

function ProofStrip({ listings }: { listings: ProofListing[] }) {
  return (
    <div className="mx-auto mt-6 max-w-md text-left">
      <p className="mb-2 text-center text-sm font-semibold">Already on Evntly</p>
      <ul className="grid grid-cols-3 gap-3">
        {listings.map((l) => (
          <li key={l.id}>
            <Link href={`/vendor/${l.id}`} className="group block">
              <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.avatarUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
              </div>
              <p className="mt-1.5 truncate text-[13px] font-medium">{l.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {categoryLabel(l.category)}
                {l.city ? ` · ${l.city}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Honest about where Evntly is (17 Nov 2026: a handful of customer enquiries a
// month). Never imply steady enquiries until the numbers say so.
const STAGE_NOTE =
  "We're listing Sydney vendors first, so customer enquiries are only just starting. Founding Vendors are shown first as more customers arrive.";

// What a vendor needs before starting, said before they tap Claim.
const SETUP_NOTE = `Takes ${SETUP_TIME}. You'll need your ABN; you can save first and add photos after.`;

// The Vendor Service Agreement, Schedule 1 (fees). Keep in step with it.
const DEAL_TERMS = `${FEE_SUMMARY} ${FEE_CHANGE_PROMISE}`;

export default async function FoundingVendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const source = sourceFromParams(params);
  const referral = referralFromParams(params);
  const campaign = campaignFromParams(params);
  const variant = landingVariant(params);
  const [places, session, sample, liveVendors, proofListings] = await Promise.all([
    getFoundingPlaces(),
    getCurrentUser(),
    getSampleListing(variant?.category ?? null),
    getLiveVendorCount(),
    variant?.proof ? getProofListings() : Promise.resolve([] as ProofListing[]),
  ]);
  const showProof = !!variant?.proof && proofListings.length >= MIN_PROOF_LISTINGS;
  const role = navRole(session?.profile?.role, !!session);
  const hasTabBar = hasPhoneTabBar(role);
  const full = places ? places.remaining <= 0 : false;
  const claimQuery = new URLSearchParams();
  if (source) claimQuery.set("src", source);
  if (referral) claimQuery.set("ref", referral);
  if (campaign) claimQuery.set("utm_content", campaign);
  const claimPage = claimQuery.size ? `${CLAIM_PATH}?${claimQuery}` : CLAIM_PATH;
  // Signed-out visitors go straight to the vendor sign-up form (it returns to
  // the claim page afterwards); the claim page in between was an extra tap
  // that most ad visitors never got past. Signed-in visitors claim directly.
  const claimHref = session ? claimPage : `/signup?role=vendor&next=${encodeURIComponent(withAutoClaim(claimPage))}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <SourceCookie source={source} referral={referral} campaign={campaign} />

      <header className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          {variant?.eyebrow ?? `Founding Vendors · ${LAUNCH_CITY}`}
        </p>
        <h1 className="mt-3 text-[32px] leading-tight font-bold tracking-tight text-balance sm:text-[48px]">
          {variant?.headline ?? `Get found by people planning events in ${LAUNCH_CITY}`}
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">{WHAT_EVNTLY_IS}</p>

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

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          {full ? (
            <Button size="lg" nativeButton={false} render={<a href="#waitlist">Join the Waitlist</a>} />
          ) : (
            <>
              <Button size="lg" nativeButton={false} render={<ClaimLink href={claimHref}>{CLAIM_LABEL}</ClaimLink>} />
              <Button size="lg" variant="outline" nativeButton={false} render={<a href="#help">{HELP_LABEL}</a>} />
            </>
          )}
        </div>
        {!full && <p className="mt-3 text-sm font-medium">{SETUP_NOTE}</p>}
        {/* Proof-first test (utm_content v6_…): the fee promise next to the
            buttons instead of further down, and real complete listings. */}
        {variant?.proof && (
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{DEAL_TERMS}</p>
        )}
        {showProof && <ProofStrip listings={proofListings} />}
        {liveVendors !== null && liveVendors >= MIN_PROOF_COUNT && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{liveVendors}</span> {LAUNCH_CITY} vendors already
            listed
          </p>
        )}

        <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Founding places for the first 200 Sydney vendors.</span>
          {variant?.proof ? null : <> {DEAL_TERMS}</>}
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{STAGE_NOTE}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Already on Evntly?{" "}
          <Link href={`/login?next=${encodeURIComponent(withAutoClaim(claimPage))}`} className="font-medium text-foreground underline underline-offset-2">
            Log in to claim your place
          </Link>
        </p>
      </header>

      {!full && (
        <section id="help" aria-labelledby="help-heading" className="mt-12 scroll-mt-24 rounded-3xl border border-border p-6 sm:p-8">
          <h2 id="help-heading" className="text-2xl font-bold tracking-tight">
            Rather we set it up for you?
          </h2>
          <p className="mt-2 mb-6 max-w-2xl text-[15px] text-muted-foreground">
            Leave your Instagram or website. We&apos;ll draft your listing from your work and email you to check it
            before it goes live. It&apos;s still free.
          </p>
          <WaitlistForm assisted submitLabel="Ask for help" />
        </section>
      )}

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
// The done-with-you route: vendors we'd already spoken to converted at ~15%
// against ~1% for cold visitors, mostly by sending photos and letting us set
// the listing up. Offered right beside Claim, not four screens down.
const HELP_LABEL = "Set it up for me";

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
            ? "bottom-[calc(var(--tabbar-height)+var(--consent-h,0px))]"
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
          {sample?.priceSummary ? ` · ${sample.priceSummary}` : ""}
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
