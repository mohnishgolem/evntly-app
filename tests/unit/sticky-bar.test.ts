import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consentOffsetVars, stickyBarOffset } from "@/lib/sticky-bar";

describe("stickyBarOffset", () => {
  it("tab bar: sits on the tab bar and moves up by the consent card (unchanged)", () => {
    expect(stickyBarOffset(true)).toBe("bottom-[calc(var(--tabbar-height)+var(--consent-h,0px))]");
  });

  it("no tab bar: rises to the consent card's top edge while it's shown", () => {
    const cls = stickyBarOffset(false);
    expect(cls).toContain("bottom-[var(--consent-top,0px)]");
    // Home-indicator padding drops back to 0.75rem once the bar is lifted
    // off the screen edge (the card sits over the indicator instead).
    expect(cls).toContain("pb-[max(0.75rem,calc(env(safe-area-inset-bottom)-var(--consent-top,0px)))]");
    expect(cls).not.toContain("bottom-0");
  });

  it("no tab bar, no consent card: --consent-top is unset, so the bar is at the edge with safe-area padding", () => {
    // Both var() fallbacks are 0px: bottom 0 and pb = max(0.75rem, safe area),
    // exactly the old "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]".
    const cls = stickyBarOffset(false);
    expect(cls.match(/var\(--consent-top,0px\)/g)).toHaveLength(2);
  });
});

describe("consentOffsetVars", () => {
  it("phone with the card shown: room for the card plus an 8px gap, and its top edge", () => {
    expect(consentOffsetVars(true, 96)).toEqual({
      "--consent-h": "104px",
      "--consent-top": "calc(var(--consent-bottom) + 96px)",
    });
  });

  it("wider screens: the card is a bottom bar, nothing floats above it", () => {
    expect(consentOffsetVars(false, 96)).toEqual({ "--consent-h": "0px", "--consent-top": "0px" });
  });
});

describe("--consent-bottom (globals.css)", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\s+/g, " ");

  it("defaults to just above the tab bar, so browsers without :has() and the streaming tab bar keep the old spot", () => {
    expect(css).toContain(":root { --consent-bottom: calc(var(--tabbar-height) + 0.5rem); }");
  });

  it("drops to the home indicator only when the page has no tab bar", () => {
    expect(css).toContain(
      ":root:not(:has([data-phone-tabbar])) { --consent-bottom: max(0.5rem, env(safe-area-inset-bottom)); }"
    );
    expect(css).not.toMatch(/:root:has\(\[data-phone-tabbar\]\)/);
  });
});
