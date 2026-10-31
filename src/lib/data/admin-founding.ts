import { createClient } from "@/lib/supabase/server";
import { completenessPercent, profileChecklist } from "@/lib/profile-completeness";
import { FOUNDING_SOURCES } from "@/lib/founding/sources";

// Everything the Beta Vendors admin page and its CSV export show. All reads
// use the admin's own session: the beta tables are readable only by
// MFA-verified admins (RLS), so a non-admin gets empty lists.

export type RecruitmentRow = {
  waitlistId: string | null;
  applicationId: string | null;
  email: string;
  firstName: string | null;
  businessName: string | null;
  category: string | null;
  onWaitlist: boolean;
  consent: boolean;
  unsubscribed: boolean;
  inviteStatus: string | null;
  delivery: string | null;
  sendCount: number;
  lastSentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  claimedAt: string | null;
  inviteError: string | null;
  inviteExpiresAt: string | null;
  applicationStatus: string | null;
  source: string | null;
  listingId: string | null;
  listingName: string | null;
  listingStatus: string | null;
  onboardingPercent: number | null;
  onboardingTodo: string[];
  adminNote: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export async function getBetaAdminData() {
  const supabase = await createClient();
  const [
    { data: program },
    { data: waitlist },
    { data: invitations },
    { data: applications },
    { data: feedback },
    { data: places },
  ] = await Promise.all([
    supabase.from("beta_program").select("*").eq("id", 1).maybeSingle(),
    supabase.from("vendor_waitlist").select("*").order("created_at", { ascending: true }).limit(5000),
    supabase.from("beta_invitations").select("*").limit(5000),
    supabase.from("beta_applications").select("*").order("created_at", { ascending: true }).limit(5000),
    supabase.from("beta_feedback").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.rpc("founding_vendor_places"),
  ]);

  const apps = applications ?? [];
  const userIds = apps.map((a) => a.user_id);
  const providerIds = apps.map((a) => a.provider_id).filter((id): id is string => !!id);
  const [{ data: users }, { data: listings }, { data: photos }, { data: packages }] = await Promise.all([
    userIds.length ? supabase.from("users").select("id, email").in("id", userIds) : Promise.resolve({ data: [] as { id: string; email: string | null }[] }),
    providerIds.length
      ? supabase.rpc("admin_service_providers").select("id, name, status, service_type, bio, abn, locations_serviced, event_types").in("id", providerIds)
      : Promise.resolve({ data: [] }),
    providerIds.length ? supabase.from("portfolio_items").select("provider_id").in("provider_id", providerIds) : Promise.resolve({ data: [] as { provider_id: string }[] }),
    providerIds.length
      ? supabase.from("vendor_packages").select("provider_id").in("provider_id", providerIds).eq("active", true)
      : Promise.resolve({ data: [] as { provider_id: string }[] }),
  ]);

  const emailByUser = new Map((users ?? []).map((u) => [u.id, u.email ?? ""]));
  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));
  const count = (rows: { provider_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.provider_id === id).length;
  const inviteByWaitlist = new Map((invitations ?? []).map((i) => [i.waitlist_id, i]));
  const appByInvitation = new Map(apps.filter((a) => a.invitation_id).map((a) => [a.invitation_id!, a]));

  const rows: RecruitmentRow[] = [];
  const usedApps = new Set<string>();
  const appByEmail = new Map(apps.map((a) => [(emailByUser.get(a.user_id) ?? "").toLowerCase(), a]));

  const appFields = (a: (typeof apps)[number] | undefined) => {
    if (!a) {
      return { applicationId: null, applicationStatus: null, source: null, listingId: null, listingName: null, listingStatus: null, onboardingPercent: null, onboardingTodo: [], adminNote: null, submittedAt: null, decidedAt: null };
    }
    usedApps.add(a.id);
    const l = a.provider_id ? listingById.get(a.provider_id) : undefined;
    const checklist = l ? profileChecklist({ ...l, photoCount: count(photos, l.id), packageCount: count(packages, l.id) }) : [];
    return {
      applicationId: a.id,
      applicationStatus: a.status,
      source: a.source,
      listingId: l?.id ?? a.provider_id,
      listingName: l?.name ?? null,
      listingStatus: l?.status ?? null,
      onboardingPercent: l ? completenessPercent(checklist) : null,
      onboardingTodo: checklist.filter((c) => !c.done).map((c) => c.label),
      adminNote: a.admin_note,
      submittedAt: a.submitted_at,
      decidedAt: a.decided_at,
    };
  };

  for (const w of waitlist ?? []) {
    const inv = inviteByWaitlist.get(w.id);
    const app = (inv ? appByInvitation.get(inv.id) : undefined) ?? appByEmail.get(w.email_normalized ?? w.email.toLowerCase());
    rows.push({
      waitlistId: w.id,
      email: w.email,
      firstName: w.first_name,
      businessName: w.business_name,
      category: w.category,
      onWaitlist: true,
      consent: w.invite_consent,
      unsubscribed: !!w.unsubscribed_at,
      inviteStatus: inv?.status ?? null,
      delivery: inv?.delivery_status ?? null,
      sendCount: inv?.send_count ?? 0,
      lastSentAt: inv?.last_sent_at ?? null,
      openedAt: inv?.opened_at ?? null,
      clickedAt: inv?.clicked_at ?? null,
      claimedAt: inv?.claimed_at ?? null,
      inviteError: inv?.last_error ?? null,
      inviteExpiresAt: inv?.expires_at ?? null,
      createdAt: w.created_at,
      ...appFields(app && !usedApps.has(app.id) ? app : undefined),
    });
  }
  // Applicants who weren't on the waitlist (Instagram, direct, …).
  for (const a of apps) {
    if (usedApps.has(a.id)) continue;
    const l = a.provider_id ? listingById.get(a.provider_id) : undefined;
    rows.push({
      waitlistId: null,
      email: emailByUser.get(a.user_id) ?? "",
      firstName: null,
      businessName: l?.name ?? null,
      category: l?.service_type ?? null,
      onWaitlist: false,
      consent: false,
      unsubscribed: false,
      inviteStatus: null,
      delivery: null,
      sendCount: 0,
      lastSentAt: null,
      openedAt: null,
      clickedAt: null,
      claimedAt: null,
      inviteError: null,
      inviteExpiresAt: null,
      createdAt: a.created_at,
      ...appFields(a),
    });
  }

  const inv = invitations ?? [];
  const live = apps.filter((a) => a.status !== "withdrawn");
  const dayAgo = Date.now() - 86_400_000;
  const stats = {
    waitlistTotal: (waitlist ?? []).length,
    waitlistConsented: (waitlist ?? []).filter((w) => w.invite_consent && !w.unsubscribed_at).length,
    unsubscribed: (waitlist ?? []).filter((w) => w.unsubscribed_at).length,
    invitationsSent: inv.filter((i) => i.send_count > 0).length,
    delivered: inv.filter((i) => i.delivery_status === "delivered").length,
    bounced: inv.filter((i) => i.delivery_status === "bounced" || i.delivery_status === "failed").length,
    complained: inv.filter((i) => i.delivery_status === "complained").length,
    sendFailures: inv.filter((i) => i.status === "failed").length,
    opened: inv.filter((i) => i.opened_at).length,
    clicked: inv.filter((i) => i.clicked_at).length,
    claimed: inv.filter((i) => i.status === "claimed").length,
    attemptsLast24h: inv.filter((i) => i.last_attempt_at && new Date(i.last_attempt_at).getTime() > dayAgo).length,
    applicationsStarted: live.length,
    applicationsSubmitted: live.filter((a) => a.status !== "started").length,
    approved: apps.filter((a) => a.status === "approved").length,
    remaining: places?.[0]?.remaining ?? null,
    capacity: places?.[0]?.capacity ?? program?.capacity ?? null,
    onboardingCompleted: rows.filter((r) => r.applicationStatus === "approved" && r.onboardingPercent === 100).length,
    newFeedback: (feedback ?? []).filter((f) => f.status === "new").length,
  };

  const bySource = FOUNDING_SOURCES.map((s) => ({
    source: s.value,
    label: s.label,
    applications: live.filter((a) => a.source === s.value).length,
    submitted: live.filter((a) => a.source === s.value && a.status !== "started").length,
    approved: apps.filter((a) => a.source === s.value && a.status === "approved").length,
  }));

  const feedbackRows = (feedback ?? []).map((f) => ({ ...f, email: emailByUser.get(f.user_id) ?? null }));

  return { program, stats, rows, bySource, feedback: feedbackRows, deployed: !!program };
}

export type BetaAdminData = Awaited<ReturnType<typeof getBetaAdminData>>;
