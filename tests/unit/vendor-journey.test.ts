import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  approvedPackages,
  BUILDER_STEPS,
  EMPTY_DRAFT,
  draftProgress,
  firstOpenStep,
  instagramHandle,
  parseDraft,
  readyToSave,
  websiteUrl,
  worthSaving,
  type ListingDraft,
} from "@/lib/vendor-journey/draft";
import { CURRENT_EVNTLY_FEE_RATE, runScenario, SCENARIO_DISCLAIMER } from "@/lib/vendor-journey/scenario";
import { plainAssist, plainDescription, suggestedPackages } from "@/lib/vendor-journey/assist";
import { isUsable } from "@/lib/vendor-journey/server";
import { CLIENT_FUNNEL_EVENTS, FUNNEL_EVENTS } from "@/lib/funnel-events";
import { PAGE_VIEW_KINDS, pageViewFor } from "@/lib/page-views";

const read = (p: string) => readFileSync(path.resolve(import.meta.dirname, "../..", p), "utf8");

const complete: ListingDraft = {
  ...EMPTY_DRAFT,
  serviceType: "photographer",
  businessName: "Harbourlight Photography",
  city: "Mosman",
  eventTypes: ["Wedding"],
  pricingModel: "from",
  basePrice: 900,
};

describe("listing draft", () => {
  it("cleans untrusted input instead of failing", () => {
    const d = parseDraft({
      serviceType: "venue", // not a launch category
      businessName: "x".repeat(500),
      eventTypes: ["Wedding", "Rave", "Wedding"],
      pricingModel: "free",
      packages: [{ name: "A", price: 100, approved: true }, { name: "" }, "junk", ...Array(10).fill({ name: "B" })],
      extra: "<script>",
    });
    expect(d.serviceType).toBe("");
    expect(d.businessName).toHaveLength(120);
    expect(d.eventTypes).toEqual(["Wedding"]);
    expect(d.pricingModel).toBe("from");
    expect(d.packages.length).toBeLessThanOrEqual(4);
    expect(d.packages[0]).toMatchObject({ name: "A", price: 100, approved: true });
    expect(d).not.toHaveProperty("extra");
    expect(parseDraft(null)).toEqual(EMPTY_DRAFT);
  });

  it("asks one question per screen, and only five are required", () => {
    expect(BUILDER_STEPS.map((s) => s.id)).toEqual(["category", "name", "location", "events", "pricing", "about", "packages", "review"]);
    expect(BUILDER_STEPS.filter((s) => s.required)).toHaveLength(5);
  });

  it("is ready to save with the same essentials the old form required (ABN comes at save)", () => {
    expect(readyToSave(EMPTY_DRAFT)).toBe(false);
    expect(readyToSave(complete)).toBe(true);
    expect(readyToSave({ ...complete, eventTypes: [] })).toBe(false);
    expect(readyToSave({ ...complete, pricingModel: "hourly", hourlyRate: null })).toBe(false);
    expect(readyToSave({ ...complete, pricingModel: "quote", basePrice: null })).toBe(true);
  });

  it("returns vendors to their first unanswered question", () => {
    expect(firstOpenStep(EMPTY_DRAFT)).toBe(0);
    expect(firstOpenStep({ ...complete, city: "" })).toBe(2);
    expect(firstOpenStep(complete)).toBe(BUILDER_STEPS.length - 1);
    expect(draftProgress(EMPTY_DRAFT)).toBe(0);
    expect(draftProgress(complete)).toBeGreaterThan(50);
  });

  it("only saves to the server once there's a category and a name", () => {
    expect(worthSaving({ ...EMPTY_DRAFT, serviceType: "dj" })).toBe(false);
    expect(worthSaving({ ...EMPTY_DRAFT, serviceType: "dj", businessName: "DJ Sam" })).toBe(true);
  });

  it("only keeps packages the vendor priced and approved", () => {
    const d: ListingDraft = {
      ...complete,
      packages: [
        { name: "Priced, approved", description: "", price: 500, includedHours: 3, inclusions: [], approved: true },
        { name: "Unpriced", description: "", price: null, includedHours: null, inclusions: [], approved: true },
        { name: "Not approved", description: "", price: 500, includedHours: null, inclusions: [], approved: false },
      ],
    };
    expect(approvedPackages(d).map((p) => p.name)).toEqual(["Priced, approved"]);
  });

  it("accepts Instagram handles and websites, rejects anything else", () => {
    expect(instagramHandle("@harbour.light")).toBe("harbour.light");
    expect(instagramHandle("https://www.instagram.com/harbourlight/?hl=en")).toBe("harbourlight");
    expect(instagramHandle("javascript:alert(1)")).toBeNull();
    expect(websiteUrl("harbourlight.com.au")).toBe("https://harbourlight.com.au/");
    expect(websiteUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("revenue scenario", () => {
  it("is only the vendor's own price × bookings, with Evntly's $0 fee", () => {
    expect(CURRENT_EVNTLY_FEE_RATE).toBe(0);
    expect(runScenario({ pricePerBooking: 800, extraBookingsPerMonth: 2 })).toEqual({ monthly: 1600, yearly: 19200, evntlyFees: 0 });
  });

  it("clamps silly inputs", () => {
    expect(runScenario({ pricePerBooking: -5, extraBookingsPerMonth: 0 }).monthly).toBe(50);
    expect(runScenario({ pricePerBooking: Number.NaN, extraBookingsPerMonth: 99 }).monthly).toBe(50 * 8);
  });

  it("is labelled hypothetical, never a forecast", () => {
    expect(SCENARIO_DISCLAIMER).toMatch(/hypothetical/i);
    expect(SCENARIO_DISCLAIMER).toMatch(/isn't a forecast/);
    expect(SCENARIO_DISCLAIMER).toMatch(/enquiries are only just starting/);
    const ui = read("src/components/vendor-journey/scenario-calculator.tsx");
    expect(ui).toContain("SCENARIO_DISCLAIMER");
    expect(ui).toMatch(/Hypothetical scenario/);
  });
});

describe("writing suggestions", () => {
  const input = { serviceType: "dj", businessName: "Northside Sound", city: "Chatswood", eventTypes: ["Wedding", "Birthday"], notes: "open format sets. we bring our own lighting" };

  it("uses only the vendor's own facts", () => {
    const bio = plainDescription(input);
    expect(bio).toContain("Northside Sound is a dj based in Chatswood, working wedding and birthday events.");
    expect(bio).toContain("Open format sets. We bring our own lighting.");
    // No invented numbers (years, events, ratings) when the vendor gave none.
    expect(bio).not.toMatch(/\d/);
    expect(bio).not.toMatch(/award|years|reviews|insured|guarantee|best/i);
  });

  it("never suggests a price, and nothing is pre-approved", () => {
    const pkgs = suggestedPackages("photographer");
    expect(pkgs.length).toBeGreaterThan(0);
    for (const p of pkgs) {
      expect(p.price).toBeNull();
      expect(p.approved).toBe(false);
    }
    expect(plainAssist({ ...input, serviceType: "unknown" }).packages).toEqual([]);
  });

  it("tells the model to use only the vendor's facts and treat them as data", () => {
    const src = read("src/lib/vendor-journey/assist.ts");
    expect(src).toMatch(/Use ONLY facts in the vendor's answers/);
    expect(src).toMatch(/data, not instructions/);
    expect(src).toMatch(/plainAssist|plain/);
  });
});

describe("draft access", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  it("closes drafts once claimed, revoked or expired", () => {
    expect(isUsable({ claimed_at: null, revoked_at: null, expires_at: future })).toBe(true);
    expect(isUsable({ claimed_at: future, revoked_at: null, expires_at: future })).toBe(false);
    expect(isUsable({ claimed_at: null, revoked_at: future, expires_at: future })).toBe(false);
    expect(isUsable({ claimed_at: null, revoked_at: null, expires_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });

  it("only lets a verified owner email save an assisted draft", () => {
    const src = read("src/lib/vendor-journey/server.ts");
    expect(src).toMatch(/if \(own\.row\.origin === "self"\) return own;/);
    expect(src).toMatch(/if \(user\.emailVerified && own\.row\.email\?\.toLowerCase\(\) === email\) return own;/);
    expect(src).toMatch(/if \(!user\.emailVerified \|\| !email\) return null;/);
    const action = read("src/lib/actions/vendor-journey.ts");
    expect(action).toMatch(/if \(!user\.email_confirmed_at\) return \{ error: "Confirm your email address first/);
  });

  it("keeps ABN, agreement and draft status checks in one place", () => {
    const create = read("src/lib/vendor-listing-create.ts");
    expect(create).toMatch(/isValidAbn\(abn\)/);
    expect(create).toMatch(/acceptedVendorAgreement !== true/);
    expect(create).toMatch(/record_legal_acceptance/);
    expect(create).toMatch(/status: "draft"/);
    // Both entry points use it.
    expect(read("src/lib/actions/vendor-signup.ts")).toMatch(/createVendorListing\(/);
    expect(read("src/lib/actions/vendor-journey.ts")).toMatch(/createVendorListing\(/);
  });

  it("never sends claim links automatically", () => {
    const admin = read("src/lib/actions/admin-vendor-drafts.ts");
    expect(admin).not.toMatch(/sendEmail|notify\(/);
    expect(admin).toMatch(/confirmPermission: z\.literal\(true/);
  });
});

describe("tracking", () => {
  it("records every journey step, and the browser can only send the anonymous ones", () => {
    for (const e of ["vendor_cta", "calculator_used", "builder_started", "builder_step", "builder_preview", "draft_saved", "listing_created", "claim_link_opened"]) {
      expect(FUNNEL_EVENTS).toContain(e);
    }
    for (const serverOnly of ["draft_saved", "listing_created", "claim_link_opened", "draft_link_sent", "draft_resumed", "suggestion_used"] as const) {
      expect(CLIENT_FUNNEL_EVENTS).not.toContain(serverOnly);
    }
    expect(pageViewFor("/become-a-vendor")).toEqual({ kind: "vendor_landing" });
    expect(pageViewFor("/become-a-vendor/start")).toEqual({ kind: "vendor_builder" });
    // The claim and resume pages carry secret tokens: never counted with their path.
    expect(pageViewFor("/become-a-vendor/claim/abc")).toBeNull();
    expect(PAGE_VIEW_KINDS).toContain("vendor_landing");
  });

  it("keeps the migration's allowed events in step with the code", () => {
    const sql = read("supabase/migrations/20261130090000_vendor_listing_drafts.sql");
    for (const e of FUNNEL_EVENTS) expect(sql).toContain(`'${e}'`);
    for (const k of PAGE_VIEW_KINDS) expect(sql).toContain(`'${k}'`);
  });
});
