// What a listing needs before it can be submitted for review (and before an
// admin can approve it): at least 3 photos or videos of the vendor's work and
// at least 1 active package. The database enforces the same rule
// (listing_completion(), submit_listing_for_review() and the approval gate
// in supabase/migrations/20261119090000_listing_completion_gate.sql), so
// keep the numbers in sync.

import { MIN_PHOTOS } from "@/lib/profile-completeness";

export { MIN_PHOTOS };
export const MIN_PACKAGES = 1;

export type ListingStatus = "draft" | "pending_review" | "approved" | "rejected" | "suspended";

export type CompletionStep = {
  key: "details" | "photos" | "packages" | "submit";
  label: string;
  detail: string;
  done: boolean;
};

export function isListingComplete(c: { photos: number; packages: number }) {
  return c.photos >= MIN_PHOTOS && c.packages >= MIN_PACKAGES;
}

/** The checklist shown on /vendor-dashboard/finish, in order. */
export function completionSteps(c: { photos: number; packages: number; status: string | null }): CompletionStep[] {
  const submitted = c.status !== null && c.status !== "draft";
  return [
    { key: "details", label: "Business details", detail: "Name, category, pricing, areas and ABN", done: true },
    {
      key: "photos",
      label: `Add at least ${MIN_PHOTOS} photos of your work`,
      detail: `${Math.min(c.photos, MIN_PHOTOS)} of ${MIN_PHOTOS} added`,
      done: c.photos >= MIN_PHOTOS,
    },
    {
      key: "packages",
      label: "Add at least one package",
      detail: c.packages > 0 ? `${c.packages} active` : "What's included and the price",
      done: c.packages >= MIN_PACKAGES,
    },
    {
      key: "submit",
      label: "Submit for review",
      detail: submitted ? "Done" : "Our team checks every listing before it goes live",
      done: submitted,
    },
  ];
}

/** Hours after a draft was created when each reminder is due. */
export const REMINDER_SCHEDULE = [
  { kind: "24h", afterHours: 24 },
  { kind: "72h", afterHours: 72 },
] as const;
export type ReminderKind = (typeof REMINDER_SCHEDULE)[number]["kind"];
/** Drafts older than this get no more reminders. */
export const REMINDER_MAX_AGE_HOURS = 14 * 24;

/**
 * Which reminder (if any) a draft is due, given its age and the reminders
 * already sent. Only the latest one that's due is sent, so a draft first
 * seen at 80 hours gets the 72 h email and never a late "24 h" one.
 */
export function dueReminder(ageHours: number, sent: readonly string[]): ReminderKind | null {
  if (ageHours < REMINDER_SCHEDULE[0].afterHours || ageHours > REMINDER_MAX_AGE_HOURS) return null;
  const due = [...REMINDER_SCHEDULE].reverse().find((r) => ageHours >= r.afterHours);
  if (!due || sent.includes(due.kind)) return null;
  // The 72 h reminder replaces a missed 24 h one; after it, nothing more.
  if (due.kind === "24h" && sent.includes("72h")) return null;
  return due.kind;
}

/** Where a vendor finishes (and later reviews) their listing. */
export const FINISH_PATH = "/vendor-dashboard/finish";

export type DueListingReminder = {
  providerId: string;
  name: string;
  ownerUserId: string | null;
  kind: ReminderKind;
  photos: number;
  packages: number;
};

/**
 * The reminders the hourly job should send: drafts still missing photos or a
 * package, at the latest step of the schedule they've reached and haven't
 * been sent. Complete drafts are skipped (the vendor only has to submit).
 */
export function pickListingReminders(
  drafts: { id: string; name: string; owner_user_id: string | null; created_at: string }[],
  rows: {
    photos: { provider_id: string }[];
    packages: { provider_id: string }[];
    sent: { provider_id: string; kind: string }[];
  },
  now: Date,
): DueListingReminder[] {
  const count = (list: { provider_id: string }[], id: string) => list.filter((r) => r.provider_id === id).length;
  const due: DueListingReminder[] = [];
  for (const d of drafts) {
    const photos = count(rows.photos, d.id);
    const packages = count(rows.packages, d.id);
    if (isListingComplete({ photos, packages })) continue;
    const ageHours = (now.getTime() - new Date(d.created_at).getTime()) / 3600_000;
    const sent = rows.sent.filter((s) => s.provider_id === d.id).map((s) => s.kind);
    const kind = dueReminder(ageHours, sent);
    if (kind) due.push({ providerId: d.id, name: d.name, ownerUserId: d.owner_user_id, kind, photos, packages });
  }
  return due;
}
