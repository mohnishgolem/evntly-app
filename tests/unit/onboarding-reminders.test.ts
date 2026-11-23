import { describe, expect, it } from "vitest";
import {
  dueStep,
  LIVE_INCOMPLETE_SCHEDULE,
  missingParts,
  NO_LISTING_SCHEDULE,
  onboardingReminderEmail,
  ONBOARDING_REMINDERS_FROM,
  pickLiveIncompleteReminders,
  pickNoListingReminders,
  type LiveListingCandidate,
  type NoListingCandidate,
} from "@/lib/onboarding-reminders";
import { FINISH_PATH } from "@/lib/listing-completion";

const HOUR = 3600_000;
const start = ONBOARDING_REMINDERS_FROM + HOUR; // just after the cut-off
const at = (hours: number) => new Date(start + hours * HOUR);
const iso = (ms: number) => new Date(ms).toISOString();

const vendor = (over: Partial<NoListingCandidate> = {}): NoListingCandidate => ({
  userId: "u1",
  email: "dj@example.com.au",
  role: "vendor",
  campaign: null,
  claimedAt: iso(start),
  hasListing: false,
  ...over,
});

const live = (over: Partial<LiveListingCandidate> = {}): LiveListingCandidate => ({
  userId: "u2",
  email: "cakes@example.com.au",
  role: "vendor",
  campaign: null,
  listingName: "Sweet Things",
  isDemo: false,
  liveSince: iso(start),
  photos: 0,
  packages: 0,
  ...over,
});

describe("dueStep", () => {
  it("sends only the latest step reached, once, and nothing past the max age", () => {
    expect(dueStep(NO_LISTING_SCHEDULE, 10, [], 336)).toBeNull();
    expect(dueStep(NO_LISTING_SCHEDULE, 25, [], 336)).toBe("no_listing_24h");
    expect(dueStep(NO_LISTING_SCHEDULE, 25, ["no_listing_24h"], 336)).toBeNull();
    expect(dueStep(NO_LISTING_SCHEDULE, 80, ["no_listing_24h"], 336)).toBe("no_listing_72h");
    // First seen at 80 h: the 72 h one only, never a late 24 h one afterwards.
    expect(dueStep(NO_LISTING_SCHEDULE, 80, [], 336)).toBe("no_listing_72h");
    expect(dueStep(NO_LISTING_SCHEDULE, 30, ["no_listing_72h"], 336)).toBeNull();
    expect(dueStep(NO_LISTING_SCHEDULE, 400, [], 336)).toBeNull();
    expect(dueStep(LIVE_INCOMPLETE_SCHEDULE, 7 * 24 + 1, ["live_incomplete_48h"], 504)).toBe("live_incomplete_7d");
    expect(dueStep(NO_LISTING_SCHEDULE, NaN, [], 336)).toBeNull();
  });
});

describe("no-listing reminders", () => {
  it("reminds a vendor who claimed a place and never saved a listing", () => {
    expect(pickNoListingReminders([vendor()], [], at(25))).toEqual([{ userId: "u1", email: "dj@example.com.au", kind: "no_listing_24h" }]);
    expect(pickNoListingReminders([vendor()], [{ user_id: "u1", kind: "no_listing_24h" }], at(30))).toEqual([]);
    expect(pickNoListingReminders([vendor()], [{ user_id: "u1", kind: "no_listing_24h" }], at(73))[0]?.kind).toBe("no_listing_72h");
  });

  it("skips vendors with a listing, test/internal accounts, and anyone from before the cut-off", () => {
    expect(pickNoListingReminders([vendor({ hasListing: true })], [], at(25))).toEqual([]);
    expect(pickNoListingReminders([vendor({ email: "qa@evntlyapp.com" })], [], at(25))).toEqual([]);
    expect(pickNoListingReminders([vendor({ role: "admin" })], [], at(25))).toEqual([]);
    expect(pickNoListingReminders([vendor({ campaign: "qa_signup" })], [], at(25))).toEqual([]);
    expect(pickNoListingReminders([vendor({ email: null })], [], at(25))).toEqual([]);
    // Signed up before the cut-off: already followed up by hand.
    expect(pickNoListingReminders([vendor({ claimedAt: iso(ONBOARDING_REMINDERS_FROM - 2 * HOUR) })], [], at(30))).toEqual([]);
  });
});

describe("live-but-incomplete reminders", () => {
  it("reminds live listings missing photos or a package, with what's missing", () => {
    const due = pickLiveIncompleteReminders([live({ photos: 3 })], [], at(49));
    expect(due).toEqual([
      { userId: "u2", email: "cakes@example.com.au", kind: "live_incomplete_48h", listingName: "Sweet Things", photos: 3, packages: 0 },
    ]);
    expect(onboardingReminderEmail(due[0]).lines[0]).toBe("Sweet Things is live on Evntly. To complete it, add one package (what's included and the price).");
  });

  it("skips complete, demo, test and pre-cut-off listings", () => {
    expect(pickLiveIncompleteReminders([live({ photos: 3, packages: 1 })], [], at(49))).toEqual([]);
    expect(pickLiveIncompleteReminders([live({ isDemo: true })], [], at(49))).toEqual([]);
    expect(pickLiveIncompleteReminders([live({ listingName: "QA Test Cakes" })], [], at(49))).toEqual([]);
    expect(pickLiveIncompleteReminders([live({ liveSince: iso(ONBOARDING_REMINDERS_FROM - HOUR) })], [], at(49))).toEqual([]);
  });
});

describe("reminder wording", () => {
  it("names what's missing", () => {
    expect(missingParts(0, 0)).toBe("3 photos of your work and one package (what's included and the price)");
    expect(missingParts(2, 1)).toBe("1 more photo of your work");
    expect(missingParts(1, 0)).toBe("2 more photos of your work and one package (what's included and the price)");
  });

  it("links to the right page and never promises enquiries, bookings or earnings", () => {
    const kinds = ["no_listing_24h", "no_listing_72h", "live_incomplete_48h", "live_incomplete_7d"] as const;
    for (const kind of kinds) {
      const email = onboardingReminderEmail({ userId: "u", email: "a@b.au", kind, listingName: "X", photos: 0, packages: 0 });
      expect(email.cta.path).toBe(kind.startsWith("live") ? FINISH_PATH : "/vendor-signup");
      const text = [email.subject, email.heading, ...email.lines].join(" ");
      expect(text).not.toMatch(/guarantee|earn|more bookings|enquiries will|\$\d/i);
      expect(text).not.toMatch(/free for the first|during the beta/i);
    }
  });
});
