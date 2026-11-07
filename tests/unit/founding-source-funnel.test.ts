import { describe, expect, it } from "vitest";
import { sourceFunnel } from "@/lib/founding/source-funnel";

const row = (rows: ReturnType<typeof sourceFunnel>, source: string) => rows.find((r) => r.source === source)!;

describe("founding vendor funnel by source", () => {
  it("counts each stage per source: claimed, submitted, approved, listing complete", () => {
    const rows = sourceFunnel([
      { source: "meta_ads", status: "started", onboardingPercent: null },
      { source: "meta_ads", status: "submitted", onboardingPercent: 40 },
      { source: "meta_ads", status: "approved", onboardingPercent: 70 },
      { source: "meta_ads", status: "approved", onboardingPercent: 100 },
      { source: "instagram_dm", status: "needs_changes", onboardingPercent: 50 },
      { source: "instagram_dm", status: "rejected", onboardingPercent: 20 },
    ]);
    expect(row(rows, "meta_ads")).toMatchObject({ label: "Meta ads (paid)", applications: 4, submitted: 3, approved: 2, complete: 1 });
    expect(row(rows, "instagram_dm")).toMatchObject({ applications: 2, submitted: 2, approved: 0, complete: 0 });
    expect(row(rows, "waitlist_email")).toMatchObject({ applications: 0, submitted: 0, approved: 0, complete: 0 });
  });

  it("leaves withdrawn applications out and counts a missing source as direct", () => {
    const rows = sourceFunnel([
      { source: "meta_ads", status: "withdrawn", onboardingPercent: null },
      { source: null, status: "approved", onboardingPercent: 100 },
    ]);
    expect(row(rows, "meta_ads").applications).toBe(0);
    expect(row(rows, "direct")).toMatchObject({ applications: 1, approved: 1, complete: 1 });
  });

  it("lists every known source once, in the usual order", () => {
    const sources = sourceFunnel([]).map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources).toContain("meta_ads");
    expect(sources).toContain("instagram_dm");
  });
});
