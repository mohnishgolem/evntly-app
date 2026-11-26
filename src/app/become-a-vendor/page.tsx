import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarHeart, Clock, FileCheck2, HandCoins, Lock, MessageSquareText, QrCode, Search, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WaitlistForm } from "@/components/founding/waitlist-form";
import { SourceCookie } from "@/components/founding/source-cookie";
import { ListingPreview } from "@/components/vendor-journey/listing-preview";
import { ScenarioCalculator } from "@/components/vendor-journey/scenario-calculator";
import { VendorCta } from "@/components/vendor-journey/vendor-cta";
import { getFoundingPlaces, getLiveVendorCount, getProofListings, type ProofListing } from "@/lib/data/founding";
import { getCurrentUser } from "@/lib/data/user";
import { hasPhoneTabBar, navRole } from "@/lib/nav";
import { categoryLabel, LAUNCH_CITY } from "@/lib/config";
import { campaignFromParams, referralFromParams, sourceFromParams } from "@/lib/founding/sources";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { EMPTY_DRAFT, type ListingDraft } from "@/lib/vendor-journey/draft";
import { FEE_CHANGE_PROMISE, FEE_SUMMARY } from "@/lib/vendor-terms";

export const metadata: Metadata = pageMetadata({
  title: `List your event business in ${LAUNCH_CITY}, free`,
  description: `Build a free Evntly listing in minutes, before you even make an account. Reach people planning events in ${LAUNCH_CITY} and reply to their quote requests.`,
  path: "/become-a-vendor",
});

// Vendor acquisition landing (Nov 2026). Leads with what a vendor gets, not
// what they must hand over: requirements (ABN, agreement, photos) are stated
// plainly further down and asked for only when saving. Every claim here must
// be true today; we never imply demand Evntly doesn't have yet.

const START = "/become-a-vendor/start";

type Point = { icon: LucideIcon; title: string; body: string };

const VALUE: Point[] = [
  { icon: MessageSquareText, title: "Quote requests with the details", body: "Customers send their date, suburb, guest count and budget, so you can reply with a real quote, not twenty questions." },
  { icon: HandCoins, title: "Keep what you earn", body: "No subscription, commission or booking fees today. Customers pay you directly, on your terms." },
  { icon: Search, title: "Founding Vendors shown first", body: "The first 200 Sydney vendors get a Founding Vendor badge and appear ahead of others in search." },
  { icon: QrCode, title: "A profile you can share", body: "A clean page with your photos, packages and reviews, plus a link and QR code for your Instagram bio." },
];

const STEPS: Point[] = [
  { icon: Sparkles, title: "Build your preview", body: "Answer a few quick questions, one at a time. No account needed, and it saves as you go." },
  { icon: FileCheck2, title: "Save it as your listing", body: "Create a free account, confirm your email, add your ABN and accept the vendor agreement." },
  { icon: BadgeCheck, title: "We check it, you go live", body: "Add 3 photos and a package, then submit. A real person reviews every listing, usually within 48 hours." },
];

const FAQ = [
  { q: "Do I need an account to start?", a: "No. Build your listing preview first. You only create an account when you want to save it as your listing." },
  { q: "Will my listing go live straight away?", a: "No. Nothing is public until you've saved it, added photos and a package, submitted it, and we've approved it." },
  { q: "Does it cost anything?", a: `${FEE_SUMMARY} ${FEE_CHANGE_PROMISE}` },
  { q: "How many enquiries will I get?", a: "We can't promise any. Evntly is new in Sydney and customer enquiries are only just starting. Founding Vendors are shown first as more customers arrive, and we'll tell you honestly how it's going." },
  { q: "Who can join?", a: `${LAUNCH_CITY}-based event businesses with an ABN: photographers, videographers, DJs, MCs, celebrants, decorators, florists, caterers, cake and dessert makers, makeup artists and event planners.` },
  { q: "Can you set it up for me?", a: "Yes, for free. Leave your Instagram or website below, or reply to our message, and we'll draft it with you. You check and approve everything before it's saved, and it only goes live after you submit it." },
];

// A clearly labelled example (not a real business) for the hero preview.
const EXAMPLE: ListingDraft = {
  ...EMPTY_DRAFT,
  serviceType: "photographer",
  businessName: "Your business name",
  city: "Parramatta",
  eventTypes: ["Wedding", "Birthday", "Cultural"],
  pricingModel: "from",
  basePrice: 900,
  bio: "A few lines about your style and what customers can expect. You write it, or we can suggest a draft from your own words.",
  packages: [{ name: "Event coverage", description: "", price: 900, includedHours: 3, inclusions: ["Edited online gallery"], approved: true }],
};

const MIN_LIVE_COUNT = 5;

export default async function BecomeAVendorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const [session, liveVendors, proof, places] = await Promise.all([getCurrentUser(), getLiveVendorCount(), getProofListings(), getFoundingPlaces()]);
  const hasTabBar = hasPhoneTabBar(navRole(session?.profile?.role, !!session));
  const expired = params.link === "expired";

  return (
    <div className="bg-canvas">
      <SourceCookie source={sourceFromParams(params)} referral={referralFromParams(params)} campaign={campaignFromParams(params)} />

      {expired && (
        <p role="status" className="mx-auto mt-4 max-w-2xl rounded-2xl bg-secondary px-4 py-3 text-center text-[15px]">
          That link has expired or was replaced. Start again below, or email hello@evntlyapp.com and we&apos;ll help.
        </p>
      )}

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-12 sm:px-6 lg:grid-cols-[1fr_400px] lg:pt-16">
        <div>
          <p className="text-eyebrow text-primary-text">For {LAUNCH_CITY} event businesses</p>
          <h1 className="mt-3 text-[36px] leading-[1.05] font-bold tracking-tight text-balance sm:text-[54px]">
            Your next client is planning an event in {LAUNCH_CITY}.
          </h1>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-muted-foreground">
            Put your business where people planning weddings, birthdays and corporate events look for vendors, and reply to their
            quote requests. Free to list.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="h-13 px-7 text-[17px]" nativeButton={false} render={<VendorCta href={START} where="hero">Start your free listing <ArrowRight aria-hidden /></VendorCta>} />
            <Button size="lg" variant="raised" className="h-13 px-7 text-[17px]" nativeButton={false} render={<VendorCta href="#help" where="hero_help">Set it up with me</VendorCta>} />
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden /> About 10 minutes
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Sparkles className="size-4" aria-hidden /> No account to start
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Lock className="size-4" aria-hidden /> Private until you approve it
            </li>
          </ul>
          {liveVendors !== null && liveVendors >= MIN_LIVE_COUNT && (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{liveVendors}</span> {LAUNCH_CITY} vendors already listed
              {places && places.remaining > 0 ? (
                <>
                  {" "}
                  · <span className="font-semibold text-foreground tabular-nums">{places.remaining}</span> Founding places left
                </>
              ) : null}
            </p>
          )}
        </div>
        <figure>
          <ListingPreview draft={EXAMPLE} compact />
          <figcaption className="mt-2 text-center text-xs text-muted-foreground">Example of what you&apos;ll build. Not a real business.</figcaption>
        </figure>
      </section>

      {/* Value */}
      <section aria-labelledby="value-heading" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="value-heading" className="text-[28px] font-bold tracking-tight sm:text-[36px]">
          What you get
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {VALUE.map((v) => (
            <li key={v.title} className="surface-raised flex gap-4 rounded-card p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-secondary text-primary">
                <v.icon className="size-[22px]" strokeWidth={1.75} aria-hidden />
              </span>
              <span>
                <span className="block text-[17px] font-semibold">{v.title}</span>
                <span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{v.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Scenario */}
      <section aria-labelledby="scenario-heading" className="mx-auto grid max-w-6xl items-start gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_440px]">
        <div>
          <h2 id="scenario-heading" className="text-[28px] font-bold tracking-tight sm:text-[36px]">
            Small numbers add up
          </h2>
          <p className="mt-3 max-w-lg text-[17px] leading-relaxed text-muted-foreground">
            For most event businesses one or two extra bookings a month makes a real difference. Try your own numbers. We
            won&apos;t pretend to know how many you&apos;ll get.
          </p>
          <p className="mt-4 max-w-lg rounded-2xl bg-secondary p-4 text-[15px] leading-relaxed">
            <span className="font-semibold">Where Evntly is today:</span> we&apos;re new and listing Sydney vendors first, so customer
            enquiries are only just starting. We&apos;ll be straight with you about how it&apos;s going.
          </p>
        </div>
        <ScenarioCalculator />
      </section>

      {/* Genuine vendors */}
      {proof.length >= 2 && <ProofSection listings={proof} />}

      {/* How it works */}
      <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="how-heading" className="text-[28px] font-bold tracking-tight sm:text-[36px]">
          How it works
        </h2>
        <ol className="mt-6 grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="surface-raised rounded-card p-5">
              <span className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full [background:var(--gradient-coral-strong)] font-bold text-primary-foreground tabular-nums">{i + 1}</span>
                <s.icon className="size-5 text-primary" aria-hidden />
              </span>
              <h3 className="mt-4 text-[17px] font-semibold">{s.title}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <Button size="lg" className="mt-6 w-full sm:w-auto" nativeButton={false} render={<VendorCta href={START} where="how">Start your free listing</VendorCta>} />
      </section>

      {/* Pricing, eligibility, verification */}
      <section aria-labelledby="terms-heading" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="terms-heading" className="text-[28px] font-bold tracking-tight sm:text-[36px]">
          Pricing, eligibility and checks
        </h2>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <TermsCard title="What it costs" icon={HandCoins}>
            <p>{FEE_SUMMARY}</p>
            <p>{FEE_CHANGE_PROMISE}</p>
            <p>Customers pay you directly. Evntly doesn&apos;t hold booking payments.</p>
          </TermsCard>
          <TermsCard title="Who can list" icon={CalendarHeart}>
            <p>Businesses based in {LAUNCH_CITY} that provide event services in one of our categories.</p>
            <p>An ABN (applying is free at abr.gov.au).</p>
            <p>Photos of your own work, and at least one package with a price.</p>
          </TermsCard>
          <TermsCard title="How we check" icon={ShieldCheck}>
            <p>You confirm your email with a one-time code.</p>
            <p>Your ABN must be valid, and a person reviews every listing before it goes live.</p>
            <p>We never publish a listing without the owner submitting it. You can close it at any time.</p>
          </TermsCard>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Full terms:{" "}
          <Link href="/vendor-agreement" className="underline underline-offset-2">
            Vendor Service Agreement
          </Link>{" "}
          and{" "}
          <Link href="/vendor-agreement#schedule-1" className="underline underline-offset-2">
            fee schedule
          </Link>
          .
        </p>
      </section>

      {/* Assisted onboarding */}
      <section id="help" aria-labelledby="help-heading" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6">
        <div className="grid gap-8 rounded-[28px] bg-secondary p-6 sm:p-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-eyebrow text-primary-text">Free setup help</p>
            <h2 id="help-heading" className="mt-2 text-[28px] font-bold tracking-tight sm:text-[34px]">
              Busy? We&apos;ll build it with you.
            </h2>
            <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
              Leave your Instagram or website. A real person from Evntly will get in touch, draft your listing from your own work
              with your permission, and send you a private link to check it. You change anything you like and approve it before
              it&apos;s saved. It&apos;s free.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">Prefer to talk? Email hello@evntlyapp.com or message @evntly.au on Instagram.</p>
          </div>
          <div className="rounded-card bg-background p-5 sm:p-6">
            <WaitlistForm assisted submitLabel="Ask for free setup help" />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h2 id="faq-heading" className="text-[28px] font-bold tracking-tight sm:text-[36px]">
          Questions
        </h2>
        <div className="mt-6 divide-y divide-border rounded-card border border-border bg-background">
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
        <p className="mt-8 rounded-card bg-secondary p-5 text-[15px] leading-relaxed">
          Evntly is a {LAUNCH_CITY} business run by Mohnish. Every listing is checked by a person, and you can reach us at{" "}
          <a href="mailto:hello@evntlyapp.com" className="font-medium underline underline-offset-2">
            hello@evntlyapp.com
          </a>{" "}
          or{" "}
          <a href="https://www.instagram.com/evntly.au/" className="font-medium underline underline-offset-2">
            @evntly.au
          </a>
          .
        </p>
      </section>

      {/* Phones: the start button stays in reach. */}
      <div aria-hidden className="h-24 sm:hidden" />
      <div
        className={cn(
          "frost fixed inset-x-0 z-30 border-t border-border/60 px-4 py-3 sm:hidden [--frost-bg:color-mix(in_oklab,var(--background)_92%,transparent)]",
          hasTabBar ? "bottom-[calc(var(--tabbar-height)+var(--consent-h,0px))]" : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        )}
      >
        <Button size="lg" className="w-full" nativeButton={false} render={<VendorCta href={START} where="sticky">Start your free listing</VendorCta>} />
      </div>
    </div>
  );
}

function TermsCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="surface-raised rounded-card p-5">
      <h3 className="flex items-center gap-2 text-[17px] font-semibold">
        <Icon className="size-5 text-primary" aria-hidden /> {title}
      </h3>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

// Real, complete listings only (same rules as the live vendor count).
function ProofSection({ listings }: { listings: ProofListing[] }) {
  return (
    <section aria-labelledby="proof-heading" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 id="proof-heading" className="text-[28px] font-bold tracking-tight sm:text-[36px]">
        {LAUNCH_CITY} businesses already on Evntly
      </h2>
      <p className="mt-2 text-[15px] text-muted-foreground">Real listings from vendors who&apos;ve joined. Tap one to see their profile.</p>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {listings.map((l) => (
          <li key={l.id}>
            <Link href={`/vendor/${l.id}`} className="group block">
              <div className="aspect-[4/3] overflow-hidden rounded-card bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.avatarUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
              </div>
              <p className="mt-2 truncate font-semibold">{l.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {categoryLabel(l.category)}
                {l.city ? ` · ${l.city}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
