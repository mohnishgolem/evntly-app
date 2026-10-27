import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronRight, Mail, PartyPopper, Route } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { getPaymentsStatus } from "@/lib/payments/server";
import { HELP_TOPICS, helpArticles } from "@/lib/help/content";
import { searchIndex } from "@/lib/help/search";
import { HelpSearch } from "@/components/help/help-search";
import { ReplayWalkthroughButton } from "@/components/help/replay-walkthrough-button";

export const metadata: Metadata = {
  title: "Help & Guides",
  description: "Guides and answers for planning an event or running your business on Evntly: quotes, messages, bookings, payments and cancellations.",
  alternates: { canonical: "/help" },
};

export default async function HelpCentrePage() {
  const [session, payments] = await Promise.all([getCurrentUser(), getPaymentsStatus()]);
  const articles = helpArticles({ paymentsEnabled: payments.enabled });
  const role = session?.profile?.role;
  const isVendor = role === "vendor";
  const canReplay = !!session && role !== "admin";

  const guides = [
    {
      href: "/help/customers",
      icon: PartyPopper,
      title: "Planning an event",
      body: "Find vendors, get quotes, book and manage the day.",
    },
    {
      href: "/help/vendors",
      icon: Briefcase,
      title: "For vendors",
      body: "Set up your listing, win leads and run your bookings.",
    },
  ];
  if (isVendor) guides.reverse();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[40px]">Help &amp; Guides</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
          Everything you need to know about using Evntly.
        </p>
      </header>

      <div className="mt-8">
        <HelpSearch docs={searchIndex(articles)} defaultAudience={isVendor ? "vendor" : "all"} />
      </div>

      <section aria-labelledby="guides-heading" className="mt-12">
        <h2 id="guides-heading" className="text-xl font-semibold tracking-tight">
          Guides
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {guides.map((g) => (
            <li key={g.href}>
              <Link
                href={g.href}
                className="group flex h-full items-start gap-4 rounded-2xl bg-secondary p-5 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-background text-primary shadow-sm">
                  <g.icon className="size-[22px]" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold">{g.title}</span>
                  <span className="mt-1 block text-[15px] text-muted-foreground">{g.body}</span>
                </span>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-border p-5 sm:flex-row sm:items-center">
          <Route className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">New to Evntly?</p>
            <p className="text-[15px] text-muted-foreground">
              See <Link href="/how-it-works" className="font-medium text-foreground underline underline-offset-2">how it works</Link>
              {canReplay ? ", or take the quick tour again." : " in five steps."}
            </p>
          </div>
          {canReplay && <ReplayWalkthroughButton paymentsEnabled={payments.enabled} />}
        </div>
      </section>

      <section aria-labelledby="topics-heading" className="mt-12">
        <h2 id="topics-heading" className="text-xl font-semibold tracking-tight">
          Browse by topic
        </h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {HELP_TOPICS.map((t) => {
            const inTopic = articles.filter((a) => a.topic === t.id);
            if (inTopic.length === 0) return null;
            return (
              <section key={t.id} aria-labelledby={`topic-${t.id}`}>
                <h3 id={`topic-${t.id}`} className="text-[15px] font-semibold">
                  {t.title}
                </h3>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <ul className="mt-2.5 overflow-hidden rounded-2xl bg-secondary">
                  {inTopic.map((a, i) => (
                    <li key={a.slug} className={i < inTopic.length - 1 ? "border-b border-border/60" : ""}>
                      <Link
                        href={`/help/articles/${a.slug}`}
                        className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-[15px] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">{a.title}</span>
                        {a.audience !== "both" && (
                          <span className="shrink-0 text-xs text-muted-foreground">{a.audience === "vendor" ? "Vendors" : "Customers"}</span>
                        )}
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="contact-heading" className="mt-12 flex items-start gap-3 rounded-2xl bg-secondary p-5">
        <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <div>
          <h2 id="contact-heading" className="font-semibold">
            Still need help?
          </h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Email{" "}
            <a href="mailto:hello@evntlyapp.com" className="font-medium text-foreground underline underline-offset-2">
              hello@evntlyapp.com
            </a>
            . For a problem with a booking, use <strong className="font-semibold text-foreground">Report a problem</strong> on the booking
            so the details are attached.
          </p>
        </div>
      </section>
    </div>
  );
}
