import { parseCsv } from "@/lib/founding/csv";
import { FOUNDING_GOAL } from "@/lib/founding/sources";

// The vendor acquisition pipeline: prospects found by research move through
// the first six stages by hand (database-enforced, see the
// vendor_acquisition migration); the last four are read from founding
// applications and listings, so nothing is counted twice.

export const PROSPECT_STAGES = [
  { value: "discovered", label: "Discovered" },
  { value: "verified", label: "Verified" },
  { value: "contact_eligible", label: "Contact eligible" },
  { value: "outreach_approved", label: "Outreach approved" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number]["value"];

export const VENDOR_STAGES = [
  { value: "registered", label: "Registered" },
  { value: "profile_completed", label: "Profile completed" },
  { value: "listing_approved", label: "Listing approved" },
  { value: "active", label: "Active" },
] as const;

export const CONSENT_BASES = [
  { value: "none", label: "None recorded" },
  { value: "published_business_address", label: "Published business address" },
  { value: "verbal", label: "Said yes on a call" },
  { value: "referral", label: "Referred, asked to be contacted" },
] as const;
export type ConsentBasis = (typeof CONSENT_BASES)[number]["value"];

export const PROSPECT_ACTIONS = [
  { value: "verify", label: "Mark verified", from: ["discovered"] },
  { value: "eligible", label: "Mark contact eligible", from: ["verified"] },
  { value: "approve_outreach", label: "Approve outreach", from: ["contact_eligible"] },
  { value: "contacted", label: "Mark contacted (sent)", from: ["outreach_approved"] },
  { value: "follow_up_sent", label: "Mark follow-up sent", from: ["contacted"] },
  { value: "replied", label: "Mark replied", from: ["contacted", "interested"] },
  { value: "interested", label: "Mark interested", from: ["contacted"] },
  { value: "declined", label: "Declined: never contact again", from: ["discovered", "verified", "contact_eligible", "outreach_approved", "contacted", "interested"] },
  { value: "do_not_contact", label: "Do not contact (bounced / asked)", from: ["discovered", "verified", "contact_eligible", "outreach_approved", "contacted", "interested"] },
] as const;
export type ProspectAction = (typeof PROSPECT_ACTIONS)[number]["value"];

export function isProspectAction(v: unknown): v is ProspectAction {
  return PROSPECT_ACTIONS.some((a) => a.value === v);
}
export function isConsentBasis(v: unknown): v is ConsentBasis {
  return CONSENT_BASES.some((c) => c.value === v);
}
export function actionsFor(stage: string) {
  return PROSPECT_ACTIONS.filter((a) => (a.from as readonly string[]).includes(stage));
}
export function stageLabel(stage: string) {
  return [...PROSPECT_STAGES, ...VENDOR_STAGES].find((s) => s.value === stage)?.label ?? stage;
}

// ---------- CSV import ----------

export type ProspectImportRow = {
  business_name: string;
  category: string | null;
  suburb: string | null;
  website: string | null;
  email: string | null;
  instagram: string | null;
  phone: string | null;
  source_url: string | null;
  lead_quality: "A" | "B" | "C";
  consent_basis: ConsentBasis;
  consent_note: string | null;
  notes: string | null;
};

const ALIASES: Record<string, string[]> = {
  business_name: ["business_name", "business name", "business", "name"],
  category: ["category", "service", "vendor type"],
  suburb: ["suburb", "location", "area"],
  website: ["website", "site", "url"],
  email: ["email", "public_email", "public email", "business email"],
  instagram: ["instagram", "ig", "instagram handle"],
  phone: ["phone", "mobile"],
  source_url: ["source_url", "source url", "source"],
  lead_quality: ["lead_quality", "lead quality", "quality"],
  consent_basis: ["consent_basis", "consent basis"],
  contact_eligibility: ["contact_eligibility", "contact eligibility", "eligibility"],
  notes: ["notes", "note"],
};

const clip = (v: string | undefined, max: number) => {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
};

/**
 * Research batches (e.g. outreach/03-prospects-batch-2.csv). A consent basis
 * is only recorded when the file says so: an explicit consent_basis column,
 * or a contact_eligibility starting "Email OK" (business address published
 * on their own site, no refusal notice). Everything else imports as "none"
 * and can't be contacted until someone records why we may.
 */
export function parseProspectCsv(text: string): { rows: ProspectImportRow[]; errors: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], errors: ["The file is empty."] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (key: string) => header.findIndex((h) => ALIASES[key].includes(h));
  const idx = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)]));
  if (idx.business_name < 0) return { rows: [], errors: ["Add a business_name column."] };
  if (table.length - 1 > 500) return { rows: [], errors: ["Import at most 500 rows at a time."] };

  const rows: ProspectImportRow[] = [];
  const errors: string[] = [];
  table.slice(1).forEach((cells, i) => {
    const get = (k: string) => (idx[k] >= 0 ? cells[idx[k]] : undefined);
    const name = clip(get("business_name"), 160);
    if (!name) {
      errors.push(`Row ${i + 2}: no business name.`);
      return;
    }
    const quality = get("lead_quality")?.trim().toUpperCase();
    const explicit = get("consent_basis")?.trim().toLowerCase();
    const email = clip(get("email"), 254)?.toLowerCase() ?? null;
    const consent: ConsentBasis = isConsentBasis(explicit)
      ? explicit
      : email && /^email ok/i.test(get("contact_eligibility")?.trim() ?? "")
        ? "published_business_address"
        : "none";
    rows.push({
      business_name: name,
      category: clip(get("category"), 40),
      suburb: clip(get("suburb"), 80),
      website: clip(get("website"), 300),
      email,
      instagram: clip(get("instagram"), 80),
      phone: clip(get("phone"), 60),
      source_url: clip(get("source_url"), 500),
      lead_quality: quality === "A" || quality === "C" ? quality : "B",
      consent_basis: consent,
      consent_note: consent === "published_business_address" ? clip(`Address published on ${get("source_url") ?? get("website") ?? "their website"}`, 300) : null,
      notes: clip(get("notes"), 1000),
    });
  });
  return { rows, errors };
}

export const IMPORT_VERDICTS: Record<string, string> = {
  new: "New prospect",
  already_prospect: "Already a prospect",
  on_waitlist: "On the waitlist (use invitations instead)",
  has_account: "Already has an Evntly account",
  has_listing: "Already has a listing",
  duplicate_in_file: "Duplicate in this file",
  invalid: "Invalid row",
};

// ---------- Metrics ----------

export type ProspectRecord = {
  id: string;
  business_name: string;
  category: string | null;
  suburb: string | null;
  email: string | null;
  instagram: string | null;
  phone: string | null;
  website: string | null;
  lead_quality: string;
  consent_basis: string;
  stage: string;
  contacted_at: string | null;
  follow_up_count: number;
  next_follow_up_at: string | null;
  replied_at: string | null;
  do_not_contact: boolean;
  do_not_contact_reason: string | null;
  created_at: string;
};

/** What the app knows about a vendor's founding application, by email. */
export type ApplicationFacts = {
  email: string;
  applicationId: string | null;
  applicationStatus: string | null;
  onboardingPercent: number | null;
  listingStatus: string | null;
  decidedAt: string | null;
};

const isRegistered = (a: ApplicationFacts) => !!a.applicationId && a.applicationStatus !== "withdrawn";
const isCompleted = (a: ApplicationFacts) => isRegistered(a) && a.onboardingPercent === 100;
const isApproved = (a: ApplicationFacts) => a.applicationStatus === "approved";
/** Approved, profile 100% and the listing is live. */
const isActive = (a: ApplicationFacts) => isApproved(a) && a.onboardingPercent === 100 && a.listingStatus === "approved";

/** A prospect's furthest stage, including the automatic ones once they sign up. */
export function prospectStage(p: ProspectRecord, app: ApplicationFacts | undefined) {
  if (app) {
    if (isActive(app)) return "active";
    if (isApproved(app)) return "listing_approved";
    if (isCompleted(app)) return "profile_completed";
    if (isRegistered(app)) return "registered";
  }
  return p.stage;
}

export function acquisitionMetrics(prospects: ProspectRecord[], applications: ApplicationFacts[], now = new Date()) {
  const appByEmail = new Map(applications.filter((a) => a.email).map((a) => [a.email.toLowerCase(), a]));
  const enriched = prospects.map((p) => {
    const app = p.email ? appByEmail.get(p.email.toLowerCase()) : undefined;
    return { ...p, pipelineStage: prospectStage(p, app), applicationStatus: app?.applicationStatus ?? null };
  });
  const live = enriched.filter((p) => !p.do_not_contact);
  const order = [...PROSPECT_STAGES, ...VENDOR_STAGES].map((s) => s.value as string);
  const reached = (stage: string) => live.filter((p) => order.indexOf(p.pipelineStage) >= order.indexOf(stage)).length;

  const apps = applications.filter(isRegistered);
  const approvedTotal = applications.filter(isApproved).length;
  const dueBefore = now.getTime();
  const followUpsDue = live.filter(
    (p) => p.pipelineStage === "contacted" && p.follow_up_count === 0 && !p.replied_at && p.next_follow_up_at && new Date(p.next_follow_up_at).getTime() <= dueBefore,
  );

  // Approvals in the last 28 days → weekly rate → rough weeks to the goal.
  const fourWeeksAgo = now.getTime() - 28 * 86_400_000;
  const recentApprovals = applications.filter((a) => isApproved(a) && a.decidedAt && new Date(a.decidedAt).getTime() >= fourWeeksAgo).length;
  const perWeek = Math.round((recentApprovals / 4) * 10) / 10;
  const remaining = Math.max(0, FOUNDING_GOAL - approvedTotal);
  const contacted = enriched.filter((p) => p.contacted_at).length;
  const responded = enriched.filter((p) => p.replied_at).length;

  return {
    prospects: enriched,
    funnel: [
      ...PROSPECT_STAGES.map((s) => ({ stage: s.value as string, label: s.label, count: reached(s.value), scope: "prospects" as const })),
      { stage: "registered", label: "Registered", count: apps.length, scope: "all" as const },
      { stage: "profile_completed", label: "Profile completed", count: applications.filter(isCompleted).length, scope: "all" as const },
      { stage: "listing_approved", label: "Listing approved", count: approvedTotal, scope: "all" as const },
      { stage: "active", label: "Active", count: applications.filter(isActive).length, scope: "all" as const },
    ],
    kpis: {
      verifiedProspects: reached("verified"),
      /** Eligible, waiting for Sai to approve the message. */
      awaitingApproval: live.filter((p) => p.pipelineStage === "contact_eligible").length,
      /** Approved, ready for Sai to send. */
      outreachReady: live.filter((p) => p.pipelineStage === "outreach_approved").length,
      contacted,
      responses: responded,
      interested: reached("interested"),
      doNotContact: enriched.filter((p) => p.do_not_contact).length,
      registered: apps.length,
      profilesCompleted: applications.filter(isCompleted).length,
      approved: approvedTotal,
      active: applications.filter(isActive).length,
      prospectConversion: contacted ? Math.round((enriched.filter((p) => p.contacted_at && ["registered", "profile_completed", "listing_approved", "active"].includes(p.pipelineStage)).length / contacted) * 1000) / 10 : null,
      responseRate: contacted ? Math.round((responded / contacted) * 1000) / 10 : null,
      goal: FOUNDING_GOAL,
      goalPercent: Math.min(100, Math.round((approvedTotal / FOUNDING_GOAL) * 1000) / 10),
      phase1: Math.min(approvedTotal, 20),
    },
    followUpsDue,
    forecast: { approvalsLast28Days: recentApprovals, perWeek, remaining, weeksToGoal: perWeek > 0 ? Math.ceil(remaining / perWeek) : null },
  };
}

export type AcquisitionMetrics = ReturnType<typeof acquisitionMetrics>;
