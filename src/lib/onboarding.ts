// First-time walkthrough rules. The completion status lives in the user's
// Supabase Auth metadata (`onboarding_v1`), so it follows them to every
// device without a schema change. It's only a UX preference, so it's fine
// that users can write their own metadata.

export const ONBOARDING_KEY = "onboarding_v1";

/**
 * Accounts created before the walkthrough shipped never see it pop up —
 * existing users aren't interrupted. Anyone can still open it from
 * Help & Guides.
 */
export const ONBOARDING_RELEASED_AT = Date.parse("2026-10-28T00:00:00Z");

export type OnboardingStatus = "completed" | "skipped";

export function onboardingStatus(metadata: Record<string, unknown> | null | undefined): OnboardingStatus | null {
  const value = metadata?.[ONBOARDING_KEY];
  if (value && typeof value === "object" && "status" in value) {
    const status = (value as { status: unknown }).status;
    if (status === "completed" || status === "skipped") return status;
  }
  return null;
}

// Pages where a walkthrough would get in the way: signing in/up, the legal
// documents (the Terms prompt sends people there), vendor signup, admin and
// printable invoices.
const QUIET_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/vendor-signup",
  "/terms",
  "/privacy-policy",
  "/vendor-agreement",
  "/cancellation-refund-dispute-policy",
  "/legal",
  "/admin",
];

export function isQuietPath(pathname: string) {
  return QUIET_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || /^\/bookings\/[^/]+\/invoice/.test(pathname);
}

/** Whether to open the walkthrough on its own (it can always be replayed). */
export function shouldAutoStartOnboarding({
  accountCreatedAt,
  metadata,
  legalOutstanding,
}: {
  accountCreatedAt: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  legalOutstanding: number;
}) {
  if (onboardingStatus(metadata)) return false;
  // The Terms prompt goes first; the walkthrough waits for the next page.
  if (legalOutstanding > 0) return false;
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  return Number.isFinite(created) && created >= ONBOARDING_RELEASED_AT;
}
