import type { AcquisitionMetrics } from "@/lib/acquisition/pipeline";
import type { BetaAdminData } from "@/lib/data/admin-founding";

// The daily acquisition email to admins: where we are, what changed in the
// last day, and what's waiting for a decision. Counts only: no vendor names
// or addresses, so the email is safe to forward.

const DAY_MS = 86_400_000;

/** AI phone agent measures (phone_agent_measures), last 24 hours and all time. */
export type PhoneAgentReport = { day: Record<string, number>; total: Record<string, number>; budgetCents: number };

/** Two or three plain lines on the phone agent, or nothing if it hasn't been used. */
export function phoneAgentLines(p: PhoneAgentReport | null): string[] {
  if (!p || !p.total.calls) return [];
  const d = p.day;
  const t = p.total;
  const aud = (c: number) => `A$${(c / 100).toFixed(2)}`;
  const per = (n: number) => (n > 0 && t.cost_aud_cents > 0 ? aud(t.cost_aud_cents / n) : "—");
  const lines = [
    `AI phone agent, last 24 hours: ${d.calls ?? 0} calls, ${d.connected ?? 0} answered, ${d.interested ?? 0} interested, ${d.links_sent ?? 0} links sent, ${d.assisted_requested ?? 0} assisted set-ups, ${d.callbacks ?? 0} callbacks, ${d.opted_out ?? 0} opt-outs.`,
    `AI phone agent, all time: ${t.calls} calls (${t.pilot_calls ?? 0} to vendors), ${t.registrations ?? 0} registrations, ${t.listings_completed ?? 0} completed listings; spend ${aud(t.cost_aud_cents ?? 0)} of ${aud(p.budgetCents)}; cost per registration ${per(t.registrations ?? 0)}, per completed listing ${per(t.listings_completed ?? 0)}.`,
  ];
  if (t.reviewed_calls) lines.push(`Call quality: ${(t.avg_quality_x10 / 10).toFixed(1)}/5 from ${t.reviewed_calls} reviewed calls${t.latency_p50_ms ? `, median response ${(t.latency_p50_ms / 1000).toFixed(1)}s` : ""}.`);
  return lines;
}

export function buildDailyReport(beta: Pick<BetaAdminData, "stats" | "rows">, acq: Pick<AcquisitionMetrics, "kpis" | "followUpsDue" | "forecast">, now = new Date(), phone: PhoneAgentReport | null = null) {
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
    phone?.total.call_requests_open && `${phone.total.call_requests_open} vendor${phone.total.call_requests_open === 1 ? "" : "s"} asked for a call from the AI assistant`,
  ].filter((a): a is string => !!a);

  const lines = [
    `Approved vendors: ${stats.approved} of ${stats.goal} (${Math.min(stats.approved, 20)} of 20 for Phase 1).`,
    `Last 24 hours: ${submitted24h} application${submitted24h === 1 ? "" : "s"} submitted, ${approved24h} approved.`,
    `Pipeline: ${kpis.verifiedProspects} verified prospects, ${kpis.contacted} contacted, ${kpis.responses} replied, ${kpis.interested} interested; ${kpis.registered} registered, ${kpis.profilesCompleted} profiles complete, ${kpis.active} active.`,
    `Incomplete profiles: ${stats.incompleteProfiles}.`,
    `Email health: ${stats.delivered} delivered, ${stats.bounced} bounced, ${stats.complained} spam reports, ${stats.unsubscribed} unsubscribed.`,
    ...phoneAgentLines(phone),
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
