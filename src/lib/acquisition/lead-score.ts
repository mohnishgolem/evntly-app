// Lead priority for the vendor acquisition queue. The SQL twin lives in
// .claude/skills/evntly-pipeline-tracker/sql/priority_queue.sql: change both
// together (the tests below pin the numbers).

export type CategoryGroup = "photo_video" | "dj" | "decor" | "mc" | "florist" | "makeup" | "cakes_catering" | "other";
export type NextChannel = "email_draft" | "instagram_dm" | "call_list" | "needs_contact_route";

export type LeadForScoring = {
  category: string | null;
  lead_quality: string;
  stage: string;
  email: string | null;
  instagram: string | null;
  phone: string | null;
  consent_basis: string;
};

const CATEGORY_POINTS: Record<CategoryGroup, number> = {
  photo_video: 20,
  dj: 18,
  decor: 16,
  mc: 15,
  florist: 14,
  makeup: 12,
  cakes_catering: 8,
  other: 5,
};

/** Same order of checks as the SQL CASE, so "Photo booth hire" is photo_video. */
export function categoryGroup(category: string | null): CategoryGroup {
  const c = (category ?? "").toLowerCase();
  if (/photo|video|content/.test(c)) return "photo_video";
  if (/(^|[^a-z])dj/.test(c)) return "dj";
  if (/decor|styl|balloon|hire/.test(c)) return "decor";
  if (/(^|[^a-z])mc|ceremon|celebrant/.test(c)) return "mc";
  if (/flor/.test(c)) return "florist";
  if (/makeup|hair|beauty/.test(c)) return "makeup";
  if (/cake|dessert|cater/.test(c)) return "cakes_catering";
  return "other";
}

/**
 * How we may reach them. Email only with a recorded consent basis (Spam Act:
 * inferred consent from a conspicuously published business address);
 * Instagram/phone are manual, one-to-one, approved per message.
 */
export function nextChannel(l: Pick<LeadForScoring, "email" | "instagram" | "phone" | "consent_basis">): NextChannel {
  if (l.email && l.consent_basis !== "none") return "email_draft";
  if (l.instagram) return "instagram_dm";
  if (l.phone) return "call_list";
  return "needs_contact_route";
}

const CHANNEL_POINTS: Record<NextChannel, number> = { email_draft: 20, instagram_dm: 15, call_list: 5, needs_contact_route: 0 };

export function leadScore(l: LeadForScoring): number {
  const quality = l.lead_quality === "A" ? 30 : l.lead_quality === "B" ? 20 : 5;
  const verified = ["verified", "contact_eligible", "outreach_approved"].includes(l.stage) ? 10 : 0;
  return quality + CATEGORY_POINTS[categoryGroup(l.category)] + CHANNEL_POINTS[nextChannel(l)] + verified;
}

/** Contactable leads first, then highest score. Stable for ties. */
export function prioritise<T extends LeadForScoring>(leads: T[]): (T & { score: number; channel: NextChannel })[] {
  return leads
    .map((l, i) => ({ lead: { ...l, score: leadScore(l), channel: nextChannel(l) }, i }))
    .sort(
      (a, b) =>
        Number(a.lead.channel === "needs_contact_route") - Number(b.lead.channel === "needs_contact_route") ||
        b.lead.score - a.lead.score ||
        a.i - b.i,
    )
    .map((x) => x.lead);
}
