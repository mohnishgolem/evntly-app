import { FOUNDING_SOURCES, type FoundingSource } from "@/lib/founding/sources";

/** One founding-vendor application, as the per-source funnel needs it. */
export type FunnelApplication = {
  source: string | null;
  status: string;
  /** Listing profile completeness (0–100), or null when there's no listing yet. */
  onboardingPercent: number | null;
};

export type SourceFunnelRow = {
  source: FoundingSource;
  label: string;
  /** Claimed a place (account + application), withdrawn ones left out. */
  applications: number;
  /** Submitted a listing for review (any status past "started"). */
  submitted: number;
  /** Listing approved and live. */
  approved: number;
  /** Approved and the profile is 100% complete (photos, packages and the rest). */
  complete: number;
};

/**
 * Founding-vendor funnel per source: claimed → submitted → approved → listing
 * complete. Applications with no source count as "direct", like the claim
 * function's own fallback.
 */
export function sourceFunnel(applications: FunnelApplication[]): SourceFunnelRow[] {
  const live = applications.filter((a) => a.status !== "withdrawn");
  const sourceOf = (a: FunnelApplication) => a.source ?? "direct";
  return FOUNDING_SOURCES.map((s) => {
    const mine = live.filter((a) => sourceOf(a) === s.value);
    const approved = mine.filter((a) => a.status === "approved");
    return {
      source: s.value,
      label: s.label,
      applications: mine.length,
      submitted: mine.filter((a) => a.status !== "started").length,
      approved: approved.length,
      complete: approved.filter((a) => a.onboardingPercent === 100).length,
    };
  });
}
