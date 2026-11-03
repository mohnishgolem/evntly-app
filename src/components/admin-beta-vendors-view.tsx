import { AdminHeading } from "@/components/admin-mfa-required";
import {
  ApplicationsList,
  BetaProgramSettings,
  BetaSendingControls,
  ContactsTable,
  CopyLink,
  FeedbackList,
  ReferralsList,
  WaitlistImport,
} from "@/components/admin-beta-vendors";
import type { BetaAdminData } from "@/lib/data/admin-founding";
import type { inviteSendingStatus } from "@/lib/founding/sending";
import { FOUNDING_SOURCES, foundingShareLink } from "@/lib/founding/sources";
import { cn } from "@/lib/utils";
import { formatSydney } from "@/lib/founding/schedule";

// The Beta Vendors admin page, given its data (see app/admin/beta-vendors).

function Stat({ label, value, sub, urgent }: { label: string; value: number | string; sub?: string; urgent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3", urgent ? "border-primary/40 bg-primary/5" : "border-border")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-10">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {description && <p className="mt-0.5 mb-3 text-sm text-muted-foreground">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export function BetaVendorsView({ data, sending }: { data: BetaAdminData; sending: ReturnType<typeof inviteSendingStatus> }) {
  const { stats, conversion, program, rows, bySource, feedback } = data;
  const full = stats.remaining !== null && stats.remaining <= 0;
  const invitable = rows.filter(
    (r) => r.onWaitlist && r.consent && !r.unsubscribed && !r.applicationId && (r.inviteStatus === null || r.inviteStatus === "pending" || r.inviteStatus === "failed"),
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AdminHeading
        title="Beta vendors"
        description={`Founding Vendor recruitment: ${stats.approved} of ${stats.capacity ?? "?"} places approved.`}
      />

      <section aria-labelledby="goal" className="mb-4 rounded-2xl border border-border p-4">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="goal" className="text-sm font-semibold">
            Progress to {stats.goal} approved Founding Vendors
          </h2>
          <span className="text-sm tabular-nums text-muted-foreground">
            {stats.approved} / {stats.goal} · {conversion.goalPercent}%
          </span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Approved Founding Vendors toward the goal"
          aria-valuemin={0}
          aria-valuemax={stats.goal}
          aria-valuenow={stats.approved}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${conversion.goalPercent}%` }} />
        </div>
      </section>

      <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Contacts imported" value={stats.waitlistTotal} sub={`${stats.waitlistConsented} with consent · ${stats.unsubscribed} unsubscribed`} />
        <Stat label="Eligible to invite" value={stats.eligibleToInvite} sub="Consented, not invited or applied yet" />
        <Stat
          label="Invitations scheduled"
          value={stats.invitationsScheduled}
          sub={stats.nextScheduledAt ? `Next: ${formatSydney(new Date(stats.nextScheduledAt))}` : "Held by Resend until their send time"}
        />
        <Stat label="Invitations sent" value={stats.invitationsSent} sub={`${stats.attemptsLast24h} of ${program!.daily_send_limit} booked or sent in 24h`} />
        <Stat
          label="Email delivery"
          value={`${stats.delivered} delivered`}
          sub={`${stats.bounced} bounced · ${stats.complained} spam · ${stats.sendFailures} failed`}
          urgent={stats.bounced + stats.complained + stats.sendFailures > 0}
        />
        <Stat label="Failed emails" value={stats.failedEmails} sub="Send failures, bounces and spam reports" urgent={stats.failedEmails > 0} />
        <Stat label="Clicked / claimed" value={`${stats.clicked} / ${stats.claimed}`} sub="Clicks are counted when the link is opened" />
        <Stat
          label="Conversion"
          value={conversion.signup === null ? "—" : `${conversion.signup}%`}
          sub={conversion.approved === null ? "of invited vendors signed up" : `signed up · ${conversion.approved}% approved`}
        />
        <Stat label="Applications started" value={stats.applicationsStarted} />
        <Stat label="Applications submitted" value={stats.applicationsSubmitted} />
        <Stat label="Vendors approved" value={stats.approved} />
        <Stat label="Remaining places" value={stats.remaining ?? "—"} urgent={full} />
        <Stat label="Incomplete profiles" value={stats.incompleteProfiles} sub="Applicants whose listing isn't 100% yet" />
        <Stat label="Completed onboarding" value={stats.onboardingCompleted} sub="Approved + profile 100%" />
        <Stat label="Reminders" value={`${stats.remindersDue} due`} sub={`${stats.remindersSent} sent · one per invitation, after 3 days`} urgent={stats.remindersDue > 0} />
        <Stat label="New feedback" value={stats.newFeedback} urgent={stats.newFeedback > 0} />
        <Stat label="Referrals" value={stats.referred} sub={`${stats.spotlightsDue} Instagram spotlight${stats.spotlightsDue === 1 ? "" : "s"} due`} urgent={stats.spotlightsDue > 0} />
      </dl>
      <p className="mb-8 text-xs">
        <a href="/admin/beta-vendors/export" className="font-medium underline underline-offset-2">
          Export recruitment results (CSV)
        </a>
      </p>

      <Section id="apps" title="Applications" description="Approving also approves the listing (it goes live) and marks it Founding. Capacity is enforced in the database.">
        <ApplicationsList rows={rows} full={full} />
      </Section>

      <Section
        id="send"
        title="Invitations"
        description="Send yourself a test first. Real sends need BETA_INVITES_LIVE=true, skip anyone without consent, unsubscribed, already registered or already applied, and stop at the daily limit (invitations and reminders share it)."
      >
        <div className="mb-4 grid gap-1 rounded-2xl bg-secondary p-4 text-xs">
          <p>
            Resend: {sending.resendConfigured ? "configured" : "NOT configured"} · Sender: {sending.from} · Reply-to: {sending.replyTo}
          </p>
          <p>
            Live sending: <strong>{sending.live ? "ON" : "off"}</strong> · Delivery webhook: {sending.webhookConfigured ? "configured" : "not set (no delivered/bounced/opened tracking)"}
          </p>
        </div>
        <BetaSendingControls
          live={sending.live}
          maxBatch={program!.batch_size_limit}
          invitable={invitable}
          remindersDue={stats.remindersDue}
          scheduled={stats.invitationsScheduled}
        />
      </Section>

      <Section id="contacts" title="Waitlist contacts">
        <ContactsTable rows={rows} live={sending.live} maxBatch={program!.batch_size_limit} />
      </Section>

      <Section id="import" title="Import waitlist">
        <WaitlistImport />
      </Section>

      <Section id="sources" title="Share links and sources" description="UTM-tagged links to the founding vendor page. Only the source is recorded on each application.">
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Link</th>
                <th className="px-3 py-2 text-right">Applied</th>
                <th className="px-3 py-2 text-right">Submitted</th>
                <th className="px-3 py-2 text-right">Approved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bySource.map((s) => {
                const hasLink = FOUNDING_SOURCES.find((f) => f.value === s.source)?.utm;
                const url = foundingShareLink(s.source);
                return (
                  <tr key={s.source}>
                    <td className="px-3 py-2 font-medium">{s.label}</td>
                    <td className="px-3 py-2">
                      {hasLink ? (
                        <span className="flex items-center gap-2">
                          <code className="max-w-[280px] truncate text-xs text-muted-foreground">{url}</code>
                          <CopyLink url={url} />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">evntlyapp.com/founding-vendors</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.applications}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.submitted}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.approved}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="referrals"
        title="Vendor referrals"
        description="Approved founding vendors each get an invite link on their beta page. The only reward is an Instagram spotlight, due once someone they invited is approved. Post it, then mark it here."
      >
        <ReferralsList items={data.referrals} />
      </Section>

      <Section id="feedback" title="Beta feedback and bug reports">
        <FeedbackList items={feedback} />
      </Section>

      <Section id="settings" title="Program settings" description="Capacity can't go below the number already approved. Changes are audit-logged.">
        <BetaProgramSettings program={program!} />
      </Section>
    </div>
  );
}
