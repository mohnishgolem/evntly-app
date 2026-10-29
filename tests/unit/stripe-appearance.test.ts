import { describe, expect, it } from "vitest";
import { stripeAppearance } from "@/lib/payments/stripe-appearance";

describe("Stripe payment field styling", () => {
  it("uses Evntly's coral, font and rounded fields in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const a = stripeAppearance(theme);
      expect(a.variables?.colorPrimary).toBe("#e8604a");
      expect(a.variables?.fontFamily).toMatch(/^-apple-system/);
      expect(a.variables?.borderRadius).toBe("12px");
      expect(a.rules?.[".Input:focus"]?.borderColor).toBe("#e8604a");
    }
  });

  it("matches the sheet's background and text in light and dark mode", () => {
    expect(stripeAppearance("light")).toMatchObject({
      theme: "stripe",
      variables: { colorBackground: "#ffffff", colorText: "#1d1d1f" },
    });
    expect(stripeAppearance("dark")).toMatchObject({
      theme: "night",
      variables: { colorBackground: "#1b1c22", colorText: "#ffffff" },
    });
  });
});
