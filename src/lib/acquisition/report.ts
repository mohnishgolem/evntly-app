import type { AcquisitionMetrics } from "@/lib/acquisition/pipeline";
import type { BetaAdminData } from "@/lib/data/admin-founding";

// The daily acquisition email to admins: where we are, what changed in the
// last day, and what's waiting for a decision. Counts only: no vendor names
// or addresses, so the email is safe to forward.

const DAY_MS = 86_400_000;

export function buildDailyReport(beta: Pick<BetaAdminData, "stats" | "rows">, acq: Pick<AcquisitionMetrics, "kpis" | "followUpsDue" | "forecast">, now = new Date()) {
  const { stats, rows } = beta;
  const { kpis, followUpsDue, forecast } = acq;
  const since = now.getTime() - DAY_MS;
  const within = (iso: string | null) => !!iso && new Date(iso).getTime() >= since;

  const submitted24h = rows.filter((r) => within(r.submittedAt)).length;
  const approved24h = rows.filter((r) => r.applicationStatus === "approved" && within(r.decidedAt)).length;
  const toReview = rows.filter((r) => r.applicationStatus === "submitted").length;

  const actions = [
    toReview && `${toReview} application${toReview === 1 ? "" : "s"} waiting for review`,
    kpis.awaitingApproval && `${kpis.awaitingApproval} prospect${kpis.awaitingApproval === 1 ? "" : "s"} waiting for outreach approval`,
    kpis.outreachReady && `${kpis.outreachReady} approved message${kpis.outreachReady === 1 ? "" : "s"} not sent yet`,
    followUpsDue.length && `${followUpsDue.length} prospect follow-up${followUpsDue.length === 1 ? "" : "s"} due (one each, then stop)`,
    stats.remindersDue && `${stats.remindersDue} waitlist reminder${stats.remindersDue === 1 ? "" : "s"} due`,
    stats.eligibleToInvite && `${stats.eligibleToInvite} waitlist contact${stats.eligibleToInvite === 1 ? "" : "s"} eligible to invite`,
    stats.newFeedback && `${stats.newFeedback} new beta feedback item${stats.newFeedback === 1 ? "" : "s"}`,
  ].filter((a): a is string => !!a);

  const lines = [
    `Approved vendors: ${stats.approved} of ${stats.goal} (${Math.min(stats.approved, 20)} of 20 for Phase 1).`,
    `Last 24 hours: ${submitted24h} application${submitted24h === 1 ? "" : "s"} submitted, ${approved24h} approved.`,
    `Pipeline: ${kpis.verifiedProspects} verified prospects, ${kpis.contacted} contacted, ${kpis.responses} replied, ${kpis.interested} interested; ${kpis.registered} registered, ${kpis.profilesCompleted} profiles complete, ${kpis.active} active.`,
    `Incomplete profiles: ${stats.incompleteProfiles}.`,
    `Email health: ${stats.delivered} delivered, ${stats.bounced} bounced, ${stats.complained} spam reports, ${stats.unsubscribed} unsubscribed.`,
    forecast.weeksToGoal === null
      ? "Forecast: no approvals in the last 4 weeks yet, so there's no rate to project from."
      : `Forecast: ${forecast.perWeek} approvals a week over the last 4 weeks, so roughly ${forecast.weeksToGoal} weeks to ${stats.goal} at this pace (an estimate, not a promise).`,
    "",
    actions.length ? "Waiting for you:" : "Nothing is waiting for you today.",
    ...actions.map((a) => `• ${a}`),
    "",
    "Nothing is sent, published or approved automatically.",
  ];

  const date = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short" }).format(now);
  return {
    subject: `Evntly vendors ${date}: ${stats.approved}/${stats.goal} approved${actions.length ? `, ${actions.length} to action` : ""}`,
    heading: `Vendor acquisition, ${date}`,
    lines,
  };
}
