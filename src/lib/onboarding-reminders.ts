import { isTestVendorAccount } from "@/lib/acquisition/test-accounts";
import { FINISH_PATH, isListingComplete, MIN_PACKAGES, MIN_PHOTOS } from "@/lib/listing-completion";
import { SETUP_TIME } from "@/lib/vendor-terms";

// Onboarding reminders for the two groups the draft reminders never reach
// (Nov 2026 onboarding review, item 2):
//
//   A. No listing: a vendor claimed a Founding place (application "started")
//      but never saved a listing, so there is no draft to remind about.
//   C. Live but incomplete: an approved listing without 3 photos or an
//      active package. These count as live but not complete.
//
// Sent by the hourly listing-reminders job, logged in
// vendor_onboarding_reminders first (one per account and kind), and sent with
// notify() in the "reminders" category, so a vendor who turned reminders off
// gets nothing. Test and internal accounts never get one.

/**
 * Nothing before this moment gets a reminder. Vendors who signed up earlier
 * are being followed up by hand (outreach/queue), and a second, automatic
 * message would break the "two nudges max" rule. SET THIS TO THE DEPLOY DAY.
 */
export const ONBOARDING_REMINDERS_FROM = Date.parse("2026-11-25T00:00:00+11:00");

export const NO_LISTING_SCHEDULE = [
  { kind: "no_listing_24h", afterHours: 24 },
  { kind: "no_listing_72h", afterHours: 72 },
] as const;
export const LIVE_INCOMPLETE_SCHEDULE = [
  { kind: "live_incomplete_48h", afterHours: 48 },
  { kind: "live_incomplete_7d", afterHours: 7 * 24 },
] as const;
/** Older than this, a vendor gets no more automatic reminders. */
export const NO_LISTING_MAX_AGE_HOURS = 14 * 24;
export const LIVE_INCOMPLETE_MAX_AGE_HOURS = 21 * 24;

export type NoListingKind = (typeof NO_LISTING_SCHEDULE)[number]["kind"];
export type LiveIncompleteKind = (typeof LIVE_INCOMPLETE_SCHEDULE)[number]["kind"];
export type OnboardingReminderKind = NoListingKind | LiveIncompleteKind;

type Schedule = readonly { kind: string; afterHours: number }[];

/**
 * The reminder due at this age, if any: only the latest step reached, never an
 * earlier step after a later one, nothing past the max age. Same rule as the
 * draft reminders (dueReminder in listing-completion.ts).
 */
export function dueStep<S extends Schedule>(schedule: S, ageHours: number, sent: readonly string[], maxAgeHours: number): S[number]["kind"] | null {
  if (!Number.isFinite(ageHours) || ageHours < schedule[0].afterHours || ageHours > maxAgeHours) return null;
  const index = schedule.findLastIndex((s) => ageHours >= s.afterHours);
  const due = schedule[index];
  if (sent.includes(due.kind)) return null;
  if (schedule.slice(index + 1).some((later) => sent.includes(later.kind))) return null;
  return due.kind;
}

type Account = { email: string | null; role: string | null; campaign?: string | null };

function isEligibleAccount(a: Account, startedAt: number) {
  if (!a.email) return false;
  if (startedAt < ONBOARDING_REMINDERS_FROM) return false;
  return !isTestVendorAccount({ role: a.role, email: a.email, isDemo: false, campaign: a.campaign ?? null, listingName: null });
}

const hoursSince = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / 3600_000;
const sentFor = (sent: readonly { user_id: string; kind: string }[], userId: string) => sent.filter((s) => s.user_id === userId).map((s) => s.kind);

export type NoListingCandidate = Account & {
  userId: string;
  /** When they claimed their Founding place (beta_applications.created_at). */
  claimedAt: string;
  hasListing: boolean;
};

export type DueOnboardingReminder = {
  userId: string;
  email: string;
  kind: OnboardingReminderKind;
  listingName?: string;
  photos?: number;
  packages?: number;
};

export function pickNoListingReminders(
  candidates: readonly NoListingCandidate[],
  sent: readonly { user_id: string; kind: string }[],
  now: Date
): DueOnboardingReminder[] {
  const due: DueOnboardingReminder[] = [];
  for (const c of candidates) {
    if (c.hasListing || !isEligibleAccount(c, Date.parse(c.claimedAt))) continue;
    const kind = dueStep(NO_LISTING_SCHEDULE, hoursSince(c.claimedAt, now), sentFor(sent, c.userId), NO_LISTING_MAX_AGE_HOURS);
    if (kind) due.push({ userId: c.userId, email: c.email!, kind });
  }
  return due;
}

export type LiveListingCandidate = Account & {
  userId: string;
  listingName: string;
  isDemo: boolean;
  /** When it went live (beta_applications.decided_at), else when it was created. */
  liveSince: string;
  photos: number;
  packages: number;
};

export function pickLiveIncompleteReminders(
  candidates: readonly LiveListingCandidate[],
  sent: readonly { user_id: string; kind: string }[],
  now: Date
): DueOnboardingReminder[] {
  const due: DueOnboardingReminder[] = [];
  for (const c of candidates) {
    if (c.isDemo || isListingComplete(c)) continue;
    if (isTestVendorAccount({ role: c.role, email: c.email, isDemo: c.isDemo, campaign: c.campaign ?? null, listingName: c.listingName })) continue;
    if (!isEligibleAccount(c, Date.parse(c.liveSince))) continue;
    const kind = dueStep(LIVE_INCOMPLETE_SCHEDULE, hoursSince(c.liveSince, now), sentFor(sent, c.userId), LIVE_INCOMPLETE_MAX_AGE_HOURS);
    if (kind) due.push({ userId: c.userId, email: c.email!, kind, listingName: c.listingName, photos: c.photos, packages: c.packages });
  }
  return due;
}

/** What a listing still needs, in words ("2 more photos of your work and one package"). */
export function missingParts(photos: number, packages: number): string {
  const morePhotos = Math.max(0, MIN_PHOTOS - photos);
  return [
    morePhotos ? `${morePhotos} ${photos ? "more " : ""}photo${morePhotos === 1 ? "" : "s"} of your work` : null,
    packages < MIN_PACKAGES ? "one package (what's included and the price)" : null,
  ]
    .filter(Boolean)
    .join(" and ");
}

export type ReminderEmail = { subject: string; heading: string; lines: string[]; cta: { label: string; path: string } };

/** Wording for each reminder. Facts only: no promises of enquiries, bookings or earnings. */
export function onboardingReminderEmail(r: DueOnboardingReminder): ReminderEmail {
  switch (r.kind) {
    case "no_listing_24h":
      return {
        subject: "Your Founding Vendor place on Evntly is saved",
        heading: "Next: set up your listing",
        lines: [
          `You've claimed a Founding Vendor place. The next step is your listing: it takes ${SETUP_TIME}, and it saves as you go.`,
          "Rather we set it up? Use \"Set it up for me\" on the Founding Vendors page and send us your Instagram or website.",
        ],
        cta: { label: "Set up my listing", path: "/vendor-signup" },
      };
    case "no_listing_72h":
      return {
        subject: "Your Evntly listing is still waiting for you",
        heading: "Your Founding place is still saved",
        lines: [
          `Your Founding Vendor place is still saved, but customers can't find you until your listing is set up (${SETUP_TIME}).`,
          "If something got in the way, reply to hello@evntlyapp.com and we'll help.",
        ],
        cta: { label: "Set up my listing", path: "/vendor-signup" },
      };
    case "live_incomplete_48h":
    case "live_incomplete_7d": {
      const name = r.listingName ?? "Your listing";
      const missing = missingParts(r.photos ?? 0, r.packages ?? 0);
      return {
        subject: r.kind === "live_incomplete_48h" ? `Finish ${name} on Evntly` : `${name} is still missing ${r.packages ? "photos" : "a package"}`,
        heading: "Your listing is live but not finished",
        lines: [
          `${name} is live on Evntly. To complete it, add ${missing}.`,
          "Rather we add them for you? On the same page, choose \"Email your photos\" and send us your photos and your usual package with its price.",
        ],
        cta: { label: "Finish my listing", path: FINISH_PATH },
      };
    }
  }
}
