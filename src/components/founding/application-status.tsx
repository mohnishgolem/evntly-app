import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Clock, PartyPopper, PencilLine, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplicationAction } from "@/components/founding/claim-controls";
import type { MyFoundingStatus, FoundingApplicationStatus } from "@/lib/data/founding";
import { MIN_PHOTOS } from "@/lib/profile-completeness";
import { cn } from "@/lib/utils";

// A vendor's founding application: status, what's next, and the steps.

const STATUS: Record<FoundingApplicationStatus, { label: string; tone: string }> = {
  started: { label: "Not submitted yet", tone: "bg-muted text-muted-foreground" },
  submitted: { label: "Pending", tone: "bg-warning/15 text-warning" },
  approved: { label: "Approved", tone: "bg-success/15 text-success" },
  needs_changes: { label: "Needs changes", tone: "bg-primary/10 text-primary" },
  rejected: { label: "Not approved", tone: "bg-muted text-muted-foreground" },
  withdrawn: { label: "Withdrawn", tone: "bg-muted text-muted-foreground" },
};

export function ApplicationStatusView({
  application,
  listing,
  checklist,
  full,
}: {
  application: NonNullable<MyFoundingStatus["application"]>;
  listing: MyFoundingStatus["listing"];
  checklist: MyFoundingStatus["checklist"];
  full: boolean;
}) {
  const s = STATUS[application.status];
  const photosDone = checklist.find((c) => c.key === "photos")?.done ?? false;
  const steps = [
    { label: "Account created and email confirmed", done: true },
    {
      label: listing ? `Business listing: ${listing.name}` : "Create your business listing",
      done: !!listing,
      href: listing ? undefined : "/vendor-signup",
    },
    { label: `Add at least ${MIN_PHOTOS} photos of your work`, done: photosDone, href: listing && !photosDone ? "/vendor-dashboard/portfolio" : undefined },
    { label: "Submitted for review", done: application.status !== "started" && application.status !== "withdrawn" },
    { label: "Approved by the Evntly team", done: application.status === "approved" },
  ];

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Your founding vendor application</h1>
      </div>
      <p className="mb-6 flex items-center gap-2 text-[15px]">
        Status:{" "}
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold", s.tone)}>{s.label}</span>
      </p>

      {application.status === "approved" && (
        <div className="mb-6 rounded-2xl border border-success/40 bg-success/5 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <PartyPopper className="size-5 text-success" aria-hidden /> Welcome to the founding vendor beta!
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Your listing is live. Your beta checklist and feedback form are on your dashboard.</p>
          <Button className="mt-4" size="lg" nativeButton={false} render={<Link href="/vendor-dashboard/beta">Open my beta checklist</Link>} />
        </div>
      )}
      {application.status === "needs_changes" && (
        <div className="mb-6 rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <PencilLine className="size-5 text-primary" aria-hidden /> A few changes needed
          </p>
          {application.admin_note && <p className="mt-2 text-sm whitespace-pre-wrap">{application.admin_note}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {listing && <Button size="lg" variant="outline" nativeButton={false} render={<Link href={`/vendor-dashboard/edit/${listing.id}`}>Edit my listing</Link>} />}
            <ApplicationAction action="resubmit" label="I've made the changes" />
          </div>
        </div>
      )}
      {application.status === "submitted" && (
        <p className="mb-6 flex gap-2.5 rounded-2xl bg-secondary p-4 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          Thanks! Our team is reviewing your listing. We&apos;ll email you when there&apos;s a decision.
          {full ? " All places are filled at the moment. We'll let you know if one opens up." : ""}
        </p>
      )}
      {application.status === "rejected" && (
        <p className="mb-6 flex gap-2.5 rounded-2xl border border-border p-4 text-sm">
          <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            We couldn&apos;t offer you a founding place this time.
            {application.admin_note ? ` ${application.admin_note}` : ""} Your account stays open. Questions? Email hello@evntlyapp.com.
          </span>
        </p>
      )}
      {application.status === "withdrawn" && (
        <div className="mb-6 rounded-2xl border border-border p-4 text-sm">
          <p className="mb-3">You withdrew your application.</p>
          <ApplicationAction action="rejoin" label="Rejoin the beta" variant="outline" />
        </div>
      )}

      <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {steps.map((step) => (
          <li key={step.label}>
            {step.href ? (
              <Link href={step.href} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm font-medium outline-none hover:bg-muted/60 focus-visible:bg-muted/60">
                <Circle className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="flex-1">{step.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            ) : (
              <span className={cn("flex min-h-12 items-center gap-3 px-4 py-3 text-sm", !step.done && "text-muted-foreground")}>
                {step.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="flex-1">{step.label}</span>
                <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
              </span>
            )}
          </li>
        ))}
      </ol>

      {listing && application.status !== "approved" && (
        <p className="mt-4 text-sm text-muted-foreground">
          You can keep improving your listing while you wait:{" "}
          <Link href="/vendor-dashboard" className="font-medium text-foreground underline underline-offset-2">
            open your dashboard
          </Link>
          .
        </p>
      )}
      {(application.status === "submitted" || application.status === "started" || application.status === "needs_changes") && (
        <div className="mt-8 border-t border-border pt-6">
          <ApplicationAction
            action="withdraw"
            label="Withdraw my application"
            variant="ghost"
            confirm="Withdraw from the founding vendor beta? Your account and listing stay as they are."
          />
        </div>
      )}
    </>
  );
}
