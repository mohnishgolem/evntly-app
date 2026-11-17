import { describe, expect, it, vi } from "vitest";
import { landingVariant } from "@/lib/founding/landing-variants";

describe("founding landing variants (?cat=)", () => {
  it("matches each Meta V2 ad's category", () => {
    expect(landingVariant({ cat: "photographer" })?.headline).toMatch(/details up front/);
    expect(landingVariant({ cat: "videographer" })?.category).toBe("photographer");
    expect(landingVariant({ cat: "DJ" })?.headline).toMatch(/when the referral isn.t there/);
    expect(landingVariant({ cat: "decorator" })?.headline).toMatch(/event setups/);
    expect(landingVariant({ cat: ["planner", "dj"] })?.category).toBe("decorator");
  });

  it("falls back to the default page for anything else", () => {
    for (const cat of [undefined, "", "toString", "__proto__", "florist<script>"]) expect(landingVariant({ cat })).toBeNull();
  });

  it("never promises results", () => {
    for (const cat of ["photographer", "dj", "decorator"]) {
      const v = landingVariant({ cat })!;
      expect(`${v.eyebrow} ${v.headline}`).not.toMatch(/guarantee|bookings|earn|\d+ (enquiries|customers)/i);
    }
  });
});

describe("live founding vendors (proof line)", () => {
  it("lists only real, approved Founding Vendors with public fields", async () => {
    const calls: string[] = [];
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => {
        const q: Record<string, unknown> = {};
        const chain = new Proxy(q, {
          get: (_t, prop: string) => {
            if (prop === "then") return (r: (v: unknown) => void) => r({ data: [{ id: "v1", name: " DJ X ", service_type: "dj", city: "Bondi" }], count: 9, error: null });
            return (...args: unknown[]) => {
              calls.push(`${prop}(${args.map((a) => JSON.stringify(a)).join(",")})`);
              return chain;
            };
          },
        });
        return { from: (table: string) => (calls.push(`from("${table}")`), chain) };
      },
    }));
    const { getLiveFoundingVendors } = await import("@/lib/data/founding");
    expect(await getLiveFoundingVendors()).toEqual({ total: 9, vendors: [{ id: "v1", name: "DJ X", category: "dj", city: "Bondi" }] });
    expect(calls).toEqual(expect.arrayContaining(['eq("status","approved")', 'eq("founding_vendor",true)', 'eq("is_demo",false)']));
    expect(calls.join(" ")).not.toMatch(/owner_email|phone/);
  });
});
