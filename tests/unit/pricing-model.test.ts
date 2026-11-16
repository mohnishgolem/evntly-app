import { describe, expect, it } from "vitest";
import {
  estimatedBookingCost,
  priceSummary,
  priceTierFor,
  pricingColumns,
  pricingComplete,
  pricingModelOf,
  vendorPrice,
} from "@/lib/pricing-model";

// Vendors price four ways: hourly, fixed per event, "from", or quote-only.
// Every customer-facing price goes through vendorPrice(); forms save through
// pricingColumns(), which must satisfy the DB check
// service_providers_price_matches_model.

describe("vendorPrice", () => {
  it("labels all four models", () => {
    expect(vendorPrice({ pricing_model: "hourly", hourly_rate: 150 })).toMatchObject({
      label: "$150/hr",
      figure: "$150",
      suffix: "/ hr",
      compact: "$150/hr",
      amount: 150,
    });
    expect(vendorPrice({ pricing_model: "fixed", base_price: 800 })).toMatchObject({
      label: "$800 per event",
      figure: "$800",
      suffix: "per event",
      compact: "$800/event",
    });
    expect(vendorPrice({ pricing_model: "from", base_price: 500 })).toMatchObject({
      label: "From $500",
      figure: "From $500",
      suffix: "",
      compact: "From $500",
    });
    expect(vendorPrice({ pricing_model: "quote" })).toMatchObject({
      label: "Contact for pricing",
      compact: "Quote",
      amount: null,
    });
  });

  it("reads existing listings (no pricing_model yet, numeric strings) as hourly, unchanged", () => {
    expect(pricingModelOf({ hourly_rate: 120 })).toBe("hourly");
    expect(vendorPrice({ hourly_rate: "120.00" }).label).toBe("$120/hr");
    expect(vendorPrice({ pricing_model: "nonsense", hourly_rate: 90 }).label).toBe("$90/hr");
  });

  it("falls back to 'Contact for pricing' rather than showing $0", () => {
    expect(vendorPrice({ pricing_model: "hourly", hourly_rate: 0 }).label).toBe("Contact for pricing");
    expect(vendorPrice({ pricing_model: "fixed", base_price: null }).label).toBe("Contact for pricing");
  });

  it("formats cents only when there are cents", () => {
    expect(vendorPrice({ pricing_model: "fixed", base_price: 1234.5 }).label).toBe("$1,234.50 per event");
  });

  it("gives running-text summaries", () => {
    expect(priceSummary({ pricing_model: "hourly", hourly_rate: 150 })).toBe("from $150/hr");
    expect(priceSummary({ pricing_model: "fixed", base_price: 800 })).toBe("$800 per event");
    expect(priceSummary({ pricing_model: "from", base_price: 500 })).toBe("from $500");
    expect(priceSummary({ pricing_model: "quote" })).toBeNull();
  });
});

describe("estimates and tiers", () => {
  it("estimates one booking per model", () => {
    expect(estimatedBookingCost({ pricing_model: "hourly", hourly_rate: 100 })).toBe(400);
    expect(estimatedBookingCost({ pricing_model: "fixed", base_price: 800 })).toBe(800);
    expect(estimatedBookingCost({ pricing_model: "from", base_price: 500 })).toBe(500);
    expect(estimatedBookingCost({ pricing_model: "quote" })).toBeNull();
  });

  it("keeps the old hourly tiers and tiers fixed prices by the same bands", () => {
    expect([50, 100, 200, 400].map((r) => priceTierFor({ hourly_rate: r }))).toEqual(["$", "$$", "$$$", "$$$$"]);
    expect(priceTierFor({ pricing_model: "fixed", base_price: 800 })).toBe("$$$");
    expect(priceTierFor({ pricing_model: "quote" })).toBeNull();
  });
});

describe("pricingColumns (what the forms save)", () => {
  it("keeps only the field the model uses", () => {
    expect(pricingColumns({ pricingModel: "hourly", hourlyRate: 150, basePrice: 900 })).toEqual({
      pricing_model: "hourly",
      hourly_rate: 150,
      base_price: null,
    });
    expect(pricingColumns({ pricingModel: "fixed", hourlyRate: 150, basePrice: 800 })).toEqual({
      pricing_model: "fixed",
      hourly_rate: null,
      base_price: 800,
    });
    expect(pricingColumns({ pricingModel: "from", basePrice: 500 })).toEqual({
      pricing_model: "from",
      hourly_rate: null,
      base_price: 500,
    });
  });

  it("needs no amount for a custom quote", () => {
    expect(pricingColumns({ pricingModel: "quote", hourlyRate: 0, basePrice: 0 })).toEqual({
      pricing_model: "quote",
      hourly_rate: null,
      base_price: null,
    });
    expect(pricingComplete({ pricingModel: "quote" })).toBe(true);
  });

  it("asks for the amount the chosen model needs", () => {
    expect(pricingColumns({ pricingModel: "hourly", hourlyRate: 0 })).toEqual({
      error: "Enter your hourly rate, or choose another way to price.",
    });
    expect(pricingColumns({ pricingModel: "fixed", basePrice: -5 })).toEqual({
      error: "Enter a price, or choose Custom quote.",
    });
    expect(pricingComplete({ pricingModel: "from" })).toBe(false);
    expect(pricingColumns({ pricingModel: "fixed", basePrice: 5_000_000 })).toEqual({
      error: "That price looks too high. Check the amount.",
    });
  });

  it("treats drafts from before pricing models (hourlyRate only) as hourly", () => {
    expect(pricingColumns({ hourlyRate: 99.999 })).toEqual({ pricing_model: "hourly", hourly_rate: 100, base_price: null });
  });
});
