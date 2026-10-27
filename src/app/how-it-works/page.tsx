import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Inbox,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPaymentsStatus } from "@/lib/payments/server";
import { LAUNCH_CITY } from "@/lib/config";

export const metadata: Metadata = {
  title: "How it works",
  description: `How Evntly works for people planning events and for the vendors who run them in ${LAUNCH_CITY}: quotes, bookings, messages and payments.`,
  alternates: { canonical: "/how-it-works" },
};

type Step = { icon: LucideIcon; title: string; body: string };

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex flex-col rounded-2xl bg-secondary p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-background text-primary shadow-sm">
              <s.icon className="size-[22px]" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="text-sm font-semibold text-muted-foreground tabular-nums">Step {i + 1}</span>
          </div>
          <h3 className="mt-4 text-[17px] font-semibold">{s.title}</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export default async function HowItWorksPage() {
  const { enabled: paymentsEnabled } = await getPaymentsStatus();

  const customerSteps: Step[] = [
    { icon: Sparkles, title: "Tell us about your event", body: "Start Planning sets up an event board with the services you need and vendors that match. No account needed to start." },
    { icon: Search, title: "Find vendors", body: `Browse photographers, decorators, DJs, celebrants and more in ${LAUNCH_CITY}, with real reviews from completed bookings.` },
    { icon: FileText, title: "Request quotes", body: "Ask several vendors for a price. Each replies with an itemised quote, including deposit and cancellation terms." },
    { icon: CalendarCheck, title: "Accept and book", body: "Compare quotes and accept the one you want. The vendor then confirms the booking to lock in your date." },
    { icon: MessageCircle, title: "Keep in touch", body: "Message vendors on Evntly. Contact details are shared once you have a booking together." },
    { icon: Star, title: "Enjoy the day", body: "Your vendor marks the job done, you confirm it went as agreed, and you can leave a review." },
  ];

  const vendorSteps: Step[] = [
    { icon: Store, title: "List your business", body: "Add your services, prices, photos and service area. Evntly reviews new listings, usually within 24–48 hours." },
    { icon: Inbox, title: "Get leads", body: "Customers request quotes from your listing. Find more work in Smart matches and the Event Feed." },
    { icon: FileText, title: "Send quotes", body: "Reply with an itemised price, deposit and cancellation terms. Requests expire after 7 days, so reply fast." },
    { icon: CalendarCheck, title: "Confirm bookings", body: "When a customer accepts, confirm the booking to lock in the date. Evntly stops you double-booking yourself." },
    { icon: ClipboardCheck, title: "Deliver and complete", body: "Mark the job done on the event day. The booking completes when your customer confirms." },
    { icon: Star, title: "Build your reputation", body: "Customers review you after completed bookings, helping you stand out in Explore." },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-[32px] leading-tight font-bold tracking-tight sm:text-[48px]">How Evntly works</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
          One place to find trusted event vendors, compare quotes and manage bookings — and for vendors, one place to run them.
        </p>
        <nav aria-label="Jump to" className="mt-7 inline-flex rounded-full bg-secondary p-1">
          <a href="#customers" className="inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-medium hover:bg-background">
            Planning an event
          </a>
          <a href="#vendors" className="inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-medium hover:bg-background">
            For vendors
          </a>
        </nav>
      </header>

      <section id="customers" aria-labelledby="customers-heading" className="mt-16 scroll-mt-24">
        <h2 id="customers-heading" className="text-2xl font-bold tracking-tight sm:text-[32px]">
          Planning an event
        </h2>
        <p className="mt-2 max-w-2xl text-[17px] text-muted-foreground">From the first idea to the day itself.</p>
        <StepList steps={customerSteps} />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/plan">Start planning</Link>} />
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/help/customers">Read the customer guide</Link>} />
        </div>
      </section>

      <section id="vendors" aria-labelledby="vendors-heading" className="mt-20 scroll-mt-24">
        <h2 id="vendors-heading" className="text-2xl font-bold tracking-tight sm:text-[32px]">
          For vendors
        </h2>
        <p className="mt-2 max-w-2xl text-[17px] text-muted-foreground">Listing on Evntly is currently free — no subscription, commission or booking fees.</p>
        <StepList steps={vendorSteps} />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/vendor-signup">List your business</Link>} />
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/help/vendors">Read the vendor guide</Link>} />
        </div>
      </section>

      <section aria-labelledby="trust-heading" className="mt-20 grid gap-3 md:grid-cols-2">
        <h2 id="trust-heading" className="sr-only">
          Payments and protection
        </h2>
        <div className="rounded-2xl border border-border p-6">
          <Wallet className="size-6 text-primary" strokeWidth={1.75} aria-hidden />
          <h3 className="mt-3 text-[17px] font-semibold">Payments</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
            {paymentsEnabled
              ? "Some bookings use online payments through Evntly; the booking page shows exactly how. Otherwise you pay the vendor directly on the terms in their quote."
              : "You pay the vendor directly, on the terms in their quote. Evntly doesn't take or hold booking payments, and doesn't charge customers any fee."}{" "}
            <Link href="/help/articles/payments-for-customers" className="font-medium text-foreground underline underline-offset-2">
              More about payments
            </Link>
          </p>
        </div>
        <div className="rounded-2xl border border-border p-6">
          <ShieldCheck className="size-6 text-primary" strokeWidth={1.75} aria-hidden />
          <h3 className="mt-3 text-[17px] font-semibold">If something goes wrong</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
            Cancel from the booking, or report a problem up to 90 days after the event and Evntly will help both sides reach an outcome.{" "}
            <Link href="/help/articles/report-a-problem" className="font-medium text-foreground underline underline-offset-2">
              How problems are handled
            </Link>
          </p>
        </div>
      </section>

      <p className="mt-12 text-center text-[15px] text-muted-foreground">
        Have a question?{" "}
        <Link href="/help" className="font-medium text-foreground underline underline-offset-2">
          Visit Help &amp; Guides
        </Link>
      </p>
    </div>
  );
}
