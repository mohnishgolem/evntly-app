import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, FileText, Inbox, MessageCircle, MessagesSquare, ShieldCheck, Store, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceCookie } from "@/components/founding/source-cookie";
import { WaitlistForm } from "@/components/founding/waitlist-form";
import { getFoundingPlaces } from "@/lib/data/founding";
import { CLAIM_PATH, sourceFromParams } from "@/lib/founding/sources";
import { LAUNCH_CITY } from "@/lib/config";

export const metadata: Metadata = {
  title: "Founding vendors — private beta",
  description: `We're inviting 20 ${LAUNCH_CITY} event vendors to join the Evntly private beta. Claim a free vendor account and create your business listing.`,
  alternates: { canonical: "/founding-vendors" },
  openGraph: {
    title: "Become an Evntly founding vendor",
    description: `20 places for ${LAUNCH_CITY} event vendors in the Evntly private beta. Free to take part.`,
  },
};

type Point = { icon: LucideIcon; title: string; body: string };

const POINTS: Point[] = [
  { icon: Store, title: "A free account and listing", body: "Claim your free vendor account and set up your business profile, photos, prices and service area." },
  { icon: ShieldCheck, title: "No subscription fee", body: "There's no subscription fee to take part in the beta." },
  { icon: Inbox, title: "Test the whole flow", body: "Try enquiries, quotes, bookings and messaging, the same tools customers use to find and book you." },
  { icon: MessagesSquare, title: "Shape what we build", body: "Tell us what works and what doesn't. Beta vendors can send feedback and report bugs right from their dashboard." },
];

const STEPS: Point[] = [
  { icon: Users, title: "Claim your account", body: "Sign up, or log in if you already have an Evntly account. You'll confirm your email." },
  { icon: FileText, title: "Create your listing", body: "Business name, category, the Sydney areas you service, contact details and your portfolio." },
  { icon: CalendarCheck, title: "We review it", body: "Our team checks every listing. You'll see your status (Pending, Approved or Needs changes) and we'll email you." },
  { icon: MessageCircle, title: "Start testing", body: "Once approved, you'll get a short checklist to try listings, leads, quotes and bookings." },
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
    a: "There are 20 approved places. Every listing is reviewed by our team, and a place is confirmed when we approve your application. Evntly can't guarantee enquiries or bookings.",
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

export default async function FoundingVendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const source = sourceFromParams(params);
  const places = await getFoundingPlaces();
  const full = places ? places.remaining <= 0 : false;
  const claimHref = source ? `${CLAIM_PATH}?src=${source}` : CLAIM_PATH;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <SourceCookie source={source} />

      <header className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Private beta · {LAUNCH_CITY}</p>
        <h1 className="mt-3 text-[32px] leading-tight font-bold tracking-tight sm:text-[48px]">Become an Evntly founding vendor</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
          We&apos;re inviting 20 {LAUNCH_CITY} event vendors to join our private beta. Claim a free vendor account, create your
          business listing and help shape how customers discover and book event services.
        </p>

        <PlacesMeter places={places} />

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          {full ? (
            <Button size="lg" nativeButton={false} render={<a href="#waitlist">Join the Waitlist</a>} />
          ) : (
            <Button size="lg" nativeButton={false} render={<Link href={claimHref}>Claim Your Free Vendor Account</Link>} />
          )}
          <Button size="lg" variant="outline" nativeButton={false} render={<a href="#how-it-works">How it works</a>} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Already on Evntly?{" "}
          <Link href={`/login?next=${encodeURIComponent(claimHref)}`} className="font-medium text-foreground underline underline-offset-2">
            Log in to claim your place
          </Link>
        </p>
      </header>

      <section aria-labelledby="what-heading" className="mt-16">
        <h2 id="what-heading" className="text-2xl font-bold tracking-tight sm:text-[32px]">
          What&apos;s included
        </h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {POINTS.map((p) => (
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
            <Button size="lg" className="w-full sm:w-auto" nativeButton={false} render={<Link href={claimHref}>Claim Your Free Vendor Account</Link>} />
          </div>
        )}
      </section>

      <section id="waitlist" aria-labelledby="waitlist-heading" className="mt-16 scroll-mt-24 rounded-3xl border border-border p-6 sm:p-8">
        <h2 id="waitlist-heading" className="text-2xl font-bold tracking-tight">
          {full ? "All 20 places are taken — join the waitlist" : "Not ready yet? Join the waitlist"}
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

      <p className="mt-12 text-center text-[15px] text-muted-foreground">
        Questions about the beta? Email{" "}
        <a href="mailto:hello@evntlyapp.com" className="font-medium text-foreground underline underline-offset-2">
          hello@evntlyapp.com
        </a>
      </p>
    </div>
  );
}

function PlacesMeter({ places }: { places: Awaited<ReturnType<typeof getFoundingPlaces>> }) {
  if (!places) return <p className="mt-6 text-[15px] font-medium">Only 20 approved beta places</p>;
  const { capacity, approved, remaining } = places;
  const percent = capacity ? Math.min(100, Math.round((approved / capacity) * 100)) : 100;
  return (
    <div className="mx-auto mt-7 max-w-sm text-left">
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-semibold">
          {remaining > 0 ? `${remaining} of ${capacity} places left` : `All ${capacity} places filled`}
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
