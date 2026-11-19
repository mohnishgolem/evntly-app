import { describe, expect, it } from "vitest";
import { categoryGroup, leadScore, nextChannel, prioritise, type LeadForScoring } from "@/lib/acquisition/lead-score";
import { isTestVendorAccount, vendorStage } from "@/lib/acquisition/test-accounts";
import { dailyTarget, summariseVerifiedFunnel } from "@/lib/acquisition/verified-funnel";

const lead = (over: Partial<LeadForScoring> = {}): LeadForScoring => ({
  category: "photographer",
  lead_quality: "A",
  stage: "discovered",
  email: null,
  instagram: null,
  phone: null,
  consent_basis: "none",
  ...over,
});

describe("lead scoring (pinned: priority_queue.sql uses the same numbers)", () => {
  it("groups messy category labels", () => {
    expect(categoryGroup("Photographer / Videographer")).toBe("photo_video");
    expect(categoryGroup("DJ")).toBe("dj");
    expect(categoryGroup("Mobile DJ services")).toBe("dj");
    expect(categoryGroup("Decorator (balloons)")).toBe("decor");
    expect(categoryGroup("MC")).toBe("mc");
    expect(categoryGroup("Florist / Stylist")).toBe("decor"); // styl wins, same as SQL CASE order
    expect(categoryGroup("Makeup Artist")).toBe("makeup");
    expect(categoryGroup("cakes_desserts")).toBe("cakes_catering");
    expect(categoryGroup(null)).toBe("other");
  });

  it("only drafts email when a consent basis is recorded", () => {
    expect(nextChannel(lead({ email: "hi@x.com.au" }))).not.toBe("email_draft");
    expect(nextChannel(lead({ email: "hi@x.com.au", consent_basis: "published_business_address" }))).toBe("email_draft");
    expect(nextChannel(lead({ email: "hi@x.com.au", instagram: "x" }))).toBe("instagram_dm");
    expect(nextChannel(lead({ phone: "0400" }))).toBe("call_list");
    expect(nextChannel(lead())).toBe("needs_contact_route");
  });

  it("scores", () => {
    expect(leadScore(lead({ email: "a@b.co", consent_basis: "published_business_address", stage: "verified" }))).toBe(30 + 20 + 20 + 10);
    expect(leadScore(lead({ category: "cakes", lead_quality: "C", instagram: "x" }))).toBe(5 + 8 + 15);
  });

  it("puts uncontactable leads last however good they look", () => {
    const out = prioritise([
      lead({ category: "photographer", lead_quality: "A" }),
      lead({ category: "cakes", lead_quality: "C", phone: "0400" }),
    ]);
    expect(out[0].channel).toBe("call_list");
    expect(out[1].channel).toBe("needs_contact_route");
  });
});

describe("test accounts (pinned: same rules as the SQL)", () => {
  const base = { role: "vendor", email: "a@b.com.au", isDemo: false, campaign: null, listingName: "Sara Louise Photography" };
  it("keeps real vendors", () => {
    expect(isTestVendorAccount(base)).toBe(false);
    expect(isTestVendorAccount({ ...base, listingName: "Contest Photography" })).toBe(false); // "test" inside a word
    expect(isTestVendorAccount({ ...base, listingName: "Aqua Events" })).toBe(false);
  });
  it("drops internal and QA accounts", () => {
    expect(isTestVendorAccount({ ...base, role: "admin" })).toBe(true);
    expect(isTestVendorAccount({ ...base, isDemo: true })).toBe(true);
    expect(isTestVendorAccount({ ...base, email: "hello@EvntlyApp.com" })).toBe(true);
    expect(isTestVendorAccount({ ...base, campaign: "qa_claim_test" })).toBe(true);
    expect(isTestVendorAccount({ ...base, listingName: "TEST-Evntly QA (do not book)" })).toBe(true);
    expect(isTestVendorAccount({ ...base, listingName: "QA Vendor Agent" })).toBe(true);
  });
  it("drops test accounts that have no listing yet (19 Nov: 3 counted as genuine)", () => {
    expect(isTestVendorAccount({ ...base, email: "someone+qa-vendor@gmail.com" })).toBe(true);
    expect(isTestVendorAccount({ ...base, email: "someone+test@gmail.com" })).toBe(true);
    expect(isTestVendorAccount({ ...base, accountName: "krishiv test" })).toBe(true);
    expect(isTestVendorAccount({ ...base, userId: "75ff584a-0dc5-41cc-b69e-566f4bd731fa" })).toBe(true);
    // Real people are still counted.
    expect(isTestVendorAccount({ ...base, email: "alex+dj@gmail.com", accountName: "Alex Manchester" })).toBe(false);
    expect(isTestVendorAccount({ ...base, accountName: "Celeste Testa" })).toBe(false);
    expect(isTestVendorAccount({ ...base, email: "quality@x.com.au", userId: "00000000-0000-0000-0000-000000000001" })).toBe(false);
  });
  it("finds the furthest stage", () => {
    expect(vendorStage({ verified: false, listingStatus: "approved", photos: 9, packages: 9 })).toBe("account");
    expect(vendorStage({ verified: true, listingStatus: null, photos: 0, packages: 0 })).toBe("verified");
    expect(vendorStage({ verified: true, listingStatus: "draft", photos: 3, packages: 1 })).toBe("listing_created");
    expect(vendorStage({ verified: true, listingStatus: "approved", photos: 2, packages: 1 })).toBe("approved");
    expect(vendorStage({ verified: true, listingStatus: "approved", photos: 3, packages: 1 })).toBe("completed");
  });
});

describe("verified funnel summary", () => {
  it("sums genuine rows and reports test rows separately", () => {
    const s = summariseVerifiedFunnel([
      { is_test: false, source: "instagram_dm", accounts: 3, verified: 3, listings_created: 2, approved: 2, completed: 0 },
      { is_test: false, source: "direct_outreach", accounts: 2, verified: 2, listings_created: 2, approved: 2, completed: 1 },
      { is_test: true, source: "direct", accounts: 4, verified: 4, listings_created: 3, approved: 0, completed: 0 },
    ]);
    expect(s).toMatchObject({ accounts: 5, verified: 5, approved: 4, completed: 1, testExcluded: 4 });
    expect(s.bySource[0].source).toBe("direct_outreach");
  });
  it("works out the daily pace to a deadline", () => {
    // 18 Nov → 30 Nov inclusive = 13 days, 187 to go → 15/day.
    expect(dailyTarget(13, 200, new Date(Date.UTC(2026, 10, 18)), new Date(Date.UTC(2026, 10, 30)))).toEqual({ remaining: 187, daysLeft: 13, perDay: 15 });
    expect(dailyTarget(250, 200, new Date(Date.UTC(2026, 10, 18)), new Date(Date.UTC(2026, 10, 30))).perDay).toBe(0);
    expect(dailyTarget(0, 10, new Date(Date.UTC(2026, 11, 5)), new Date(Date.UTC(2026, 10, 30))).daysLeft).toBe(1);
  });
});
