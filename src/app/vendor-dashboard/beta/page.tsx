import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, Circle, PartyPopper } from "lucide-react";
import { requireVendor } from "@/lib/data/user";
import { getMyFoundingStatus } from "@/lib/data/founding";
import { createClient } from "@/lib/supabase/server";
import { BetaFeedbackForm } from "@/components/founding/beta-feedback-form";
import { CLAIM_PATH } from "@/lib/founding/sources";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Founding vendor beta",
  robots: { index: false, follow: false },
};

// Approved founding vendors: welcome, a short checklist to try the main
// flows, and the feedback / bug form. Online payments stay off in the beta.
export default async function VendorBetaPage() {
  const session = await requireVendor("/vendor-dashboard/beta");
  const status = await getMyFoundingStatus();
  const application = status?.application;
  if (!application || application.status !== "approved") redirect(CLAIM_PATH);

  const supabase = await createClient();
  const [{ count: quotesSent }, { count: bookings }, { data: myFeedback }] = await Promise.all([
    supabase
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("vendor_user_id", session.user.id)
      .not("responded_at", "is", null),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("provider_owner_user_id", session.user.id),
    supabase.from("beta_feedback").select("id, kind, message, status, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const listingDone = (status?.checklist ?? []).filter((c) => c.key !== "abn").every((c) => c.done);
  const listingId = status?.listing?.id;
  const checklist = [
    { label: "Complete your listing: photos, a package, description and service areas", done: listingDone, href: "/vendor-dashboard" },
    { label: "Check how your public profile looks to customers", done: false, href: listingId ? `/vendor/${listingId}` : "/vendor-dashboard" },
    { label: "Look through Leads: enquiries, Smart matches and the Event Feed", done: false, href: "/vendor-dashboard/enquiries" },
    { label: "Reply to an enquiry with a quote", done: (quotesSent ?? 0) > 0, href: "/vendor-dashboard/quotes" },
    { label: "Confirm a booking and keep your calendar up to date", done: (bookings ?? 0) > 0, href: "/vendor-dashboard/calendar" },
    { label: "Send us feedback: what worked, what didn't", done: (myFeedback?.length ?? 0) > 0, href: "#feedback" },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 rounded-2xl border border-success/40 bg-success/5 p-5">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <PartyPopper className="size-5 text-success" aria-hidden /> Welcome, founding vendor!
        </p>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Thanks for helping us build Evntly. Your listing is live. Use the checklist below to try the main tools, and tell us
          anything that&apos;s confusing, slow or broken. Online payments are off during the beta: customers pay you directly, on the
          terms in your quote.
        </p>
      </div>

      <section aria-labelledby="checklist" className="mb-10">
        <h2 id="checklist" className="mb-3 text-lg font-semibold">
          Your beta checklist
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {checklist.map((item) => (
            <li key={item.label}>
              <Link href={item.href} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm outline-none hover:bg-muted/60 focus-visible:bg-muted/60">
                {item.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className={cn("flex-1", item.done ? "text-muted-foreground line-through" : "font-medium")}>{item.label}</span>
                <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="feedback" aria-labelledby="feedback-heading" className="mb-10 scroll-mt-24">
        <h2 id="feedback-heading" className="mb-1 text-lg font-semibold">
          Feedback and bug reports
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">Goes straight to the Evntly team. We read every one.</p>
        <BetaFeedbackForm />
      </section>

      {!!myFeedback?.length && (
        <section aria-labelledby="sent-heading">
          <h2 id="sent-heading" className="mb-3 text-lg font-semibold">
            What you&apos;ve sent
          </h2>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {myFeedback.map((f) => (
              <li key={f.id} className="px-4 py-3 text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">
                  {f.kind === "bug" ? "Bug" : "Feedback"} ·{" "}
                  {new Date(f.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })} ·{" "}
                  {f.status === "new" ? "Received" : f.status === "reviewed" ? "Reviewed" : "Resolved"}
                </span>
                <span className="line-clamp-3 whitespace-pre-wrap">{f.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
