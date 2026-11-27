import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AA_NON_TEXT,
  AA_TEXT,
  composite,
  contrastRatio,
  isLargeText,
  parseColor,
  relativeLuminance,
  type Rgba,
} from "@/lib/contrast";

// White text on Evntly's coral must meet WCAG 2.2 AA (4.5:1, every button
// label here is under 24px / 18.66px bold). These tests read the real tokens
// from globals.css, so reverting the colours makes them fail.

const css = readFileSync("src/app/globals.css", "utf8");

/** Last declaration of each custom property in top-level `:root` / `.dark` blocks. */
function tokens(selector: ":root" | ".dark") {
  const out = new Map<string, string>();
  const esc = selector.replace(".", "\\.");
  for (const block of css.matchAll(new RegExp(`^${esc} \\{([\\s\\S]*?)^\\}`, "gm"))) {
    for (const d of block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(d[1], d[2].trim());
  }
  return out;
}
const ROOT = tokens(":root");
const DARK = tokens(".dark");
type Mode = "light" | "dark";
const MODES: Mode[] = ["light", "dark"];

function token(mode: Mode, name: string): string {
  const raw = (mode === "dark" ? DARK.get(name) : undefined) ?? ROOT.get(name);
  if (!raw) throw new Error(`${name} missing from globals.css`);
  return raw.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => token(mode, ref));
}
const color = (mode: Mode, name: string) => parseColor(token(mode, name));
/** Colour stops of a gradient token (hex or rgb/rgba). */
const stops = (mode: Mode, name: string) =>
  (token(mode, name).match(/#[0-9a-f]{3,6}\b|rgba?\([^)]*\)/gi) ?? []).map(parseColor);
const hex = (c: Rgba) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Lowest contrast of `text` across every point of a sheen painted over `fill`. */
function worstUnderSheen(text: Rgba, fill: Rgba, sheen: Rgba[]) {
  return Math.min(...sheen.map((s) => contrastRatio(text, composite(s, fill))));
}

describe("contrast helper", () => {
  it("matches the WCAG reference points", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    // Known values for the brand coral and its existing text shade.
    expect(contrastRatio("#ffffff", "#e8604a")).toBeCloseTo(3.39, 2);
    expect(contrastRatio("#ffffff", "#c2412c")).toBeCloseTo(5.14, 2);
  });

  it("composites translucent layers", () => {
    expect(hex(composite(parseColor("rgba(255, 255, 255, 0.5)"), parseColor("#000000")))).toBe("#808080");
    expect(composite(parseColor("rgba(0,0,0,0)"), parseColor("#cd4a35"))).toMatchObject(parseColor("#cd4a35"));
  });

  it("knows what counts as large text", () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(20, 600)).toBe(false); // semibold is not bold
    expect(isLargeText(17, 700)).toBe(false);
  });
});

describe("the old coral fails with white text (why this change exists)", () => {
  const white = parseColor("#ffffff");
  const oldSheen = [parseColor("rgba(255,255,255,0.16)"), parseColor("rgba(0,0,0,0.06)")];
  it.each([
    ["light base #e8604a", "#e8604a"],
    ["light hover #d4523c", "#d4523c"],
    ["dark hover #f0785f", "#f0785f"],
  ])("%s under the old sheen", (_, fill) => {
    const flat = contrastRatio(white, fill);
    const top = worstUnderSheen(white, parseColor(fill), oldSheen);
    expect(flat).toBeLessThan(AA_TEXT);
    expect(top).toBeLessThan(flat);
  });
  it.each(["#f07a63", "#f3846e"])("old btn-coral gradient top %s", (top) => {
    expect(contrastRatio(white, top)).toBeLessThan(AA_TEXT);
  });
});

describe.each(MODES)("white text on coral passes AA in %s mode", (mode) => {
  const text = () => color(mode, "--primary-foreground");

  it("default Button: strong fill and hover, at every point of the sheen", () => {
    const sheen = stops(mode, "--sheen-coral");
    expect(sheen.length).toBeGreaterThanOrEqual(2);
    for (const fill of ["--primary-strong", "--primary-strong-hover"]) {
      expect(worstUnderSheen(text(), color(mode, fill), sheen), fill).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("the sheen never lightens the fill (its lightest point is the token itself)", () => {
    for (const s of stops(mode, "--sheen-coral")) {
      expect(s.a === 0 || (s.r === 0 && s.g === 0 && s.b === 0)).toBe(true);
    }
  });

  it("btn-coral gradients, base and hover, at every stop", () => {
    for (const g of ["--gradient-coral-strong", "--gradient-coral-strong-hover"]) {
      const s = stops(mode, g);
      expect(s.length, g).toBeGreaterThanOrEqual(2);
      for (const stop of s) {
        const painted = composite(stop, color(mode, "--primary-strong"));
        expect(contrastRatio(text(), painted), `${g} ${hex(stop)}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it("hover darkens rather than lightens", () => {
    expect(relativeLuminance(color(mode, "--primary-strong-hover"))).toBeLessThan(
      relativeLuminance(color(mode, "--primary-strong"))
    );
    const base = stops(mode, "--gradient-coral-strong").map((c) => relativeLuminance(c));
    const hover = stops(mode, "--gradient-coral-strong-hover").map((c) => relativeLuminance(c));
    expect(Math.max(...hover)).toBeLessThan(Math.max(...base));
  });

  it("keeps the strong fill the same hue as the brand coral", () => {
    const hue = ({ r, g, b }: Rgba) => {
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      return max === r ? ((g - b) / (max - min)) * 60 : NaN;
    };
    expect(Math.abs(hue(color(mode, "--primary-strong")) - hue(color(mode, "--primary")))).toBeLessThan(1);
  });

  it("graphic-only coral (icons, dots, indicators) meets 3:1", () => {
    expect(contrastRatio(text(), color(mode, "--primary"))).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(color(mode, "--background"), color(mode, "--highlight"))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("focus ring meets 3:1 against the page, surfaces and the drawer", () => {
    const ring = color(mode, "--focus-ring");
    for (const bg of ["--background", "--canvas", "--surface"]) {
      expect(contrastRatio(ring, color(mode, bg)), bg).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
    expect(contrastRatio(ring, "#1c1c1f"), "drawer").toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

// The options considered (A: darker fill for text, B: dark text, C: large
// text). Titles carry the computed ratio; `pass` is the AA verdict at the
// lightest point of the paint behind the label.
describe("options table", () => {
  const W = "#ffffff";
  const oldSheenTop = "rgba(255,255,255,0.16)";
  const at = (fill: string, overlay?: string) => (overlay ? composite(parseColor(overlay), parseColor(fill)) : parseColor(fill));
  const rows: [string, string, Rgba, number, boolean][] = [
    // before
    ["before, light base #e8604a, flat", W, at("#e8604a"), AA_TEXT, false],
    ["before, light base #e8604a, sheen top", W, at("#e8604a", oldSheenTop), AA_TEXT, false],
    ["before, light hover #d4523c, flat", W, at("#d4523c"), AA_TEXT, false],
    ["before, light hover #d4523c, sheen top", W, at("#d4523c", oldSheenTop), AA_TEXT, false],
    ["before, dark hover #f0785f, flat", W, at("#f0785f"), AA_TEXT, false],
    ["before, dark hover #f0785f, sheen top", W, at("#f0785f", oldSheenTop), AA_TEXT, false],
    ["before, btn-coral top #f07a63", W, at("#f07a63"), AA_TEXT, false],
    ["before, btn-coral hover top #f3846e", W, at("#f3846e"), AA_TEXT, false],
    ["before, btn-coral active (#f07a63, brightness 0.96)", W, { r: 240 * 0.96, g: 122 * 0.96, b: 99 * 0.96, a: 1 }, AA_TEXT, false],
    // A with the old white sheen kept: even #c2412c fails at the sheen top
    ["A keep sheen, #c2412c, sheen top", W, at("#c2412c", oldSheenTop), AA_TEXT, false],
    ["A keep sheen, #b5341f, sheen top", W, at("#b5341f", oldSheenTop), AA_TEXT, true],
    // A as built: sheen only darkens, so the top is the token
    ["A built, base #cd4a35 (sheen top = fill)", W, at("#cd4a35"), AA_TEXT, true],
    ["A built, base #cd4a35, sheen bottom", W, at("#cd4a35", "rgba(0,0,0,0.06)"), AA_TEXT, true],
    ["A built, hover #c2412c", W, at("#c2412c"), AA_TEXT, true],
    ["A built, btn-coral hover bottom #b53c27", W, at("#b53c27"), AA_TEXT, true],
    ["A built, btn-coral active (#cd4a35, brightness 0.96)", W, { r: 205 * 0.96, g: 74 * 0.96, b: 53 * 0.96, a: 1 }, AA_TEXT, true],
    ["A built, one step lighter #ce4b36", W, at("#ce4b36"), AA_TEXT, false],
    // B: dark text on the existing coral
    ["B, #000000 on #e8604a", "#000000", at("#e8604a"), AA_TEXT, true],
    ["B, #1d1d1f on #e8604a", "#1d1d1f", at("#e8604a"), AA_TEXT, true],
    ["B, #1d1d1f on #e8604a sheen bottom", "#1d1d1f", at("#e8604a", "rgba(0,0,0,0.06)"), AA_TEXT, false],
    ["B, #1d1d1f on hover #d4523c", "#1d1d1f", at("#d4523c"), AA_TEXT, false],
    // C: large text (none of the coral labels qualify; listed for the record)
    ["C, white on #e8604a if text were large", W, at("#e8604a"), 3, true],
  ];
  it.each(rows.map(([name, text, bg, need, pass]) => [`${name}: ${contrastRatio(text, bg).toFixed(2)}:1`, text, bg, need, pass] as const))(
    "%s",
    (_, text, bg, need, pass) => {
      expect(contrastRatio(text, bg) >= need).toBe(pass);
    }
  );
});

describe("--primary-strong is the lightest coral that passes", () => {
  it("one step lighter on every channel would fail 4.5:1", () => {
    const strong = color("light", "--primary-strong");
    const lighter = { ...strong, r: strong.r + 1, g: strong.g + 1, b: strong.b + 1 };
    expect(contrastRatio("#ffffff", strong)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio("#ffffff", lighter)).toBeLessThan(AA_TEXT);
  });
});

describe("components put text on the strong coral, not the accent", () => {
  const button = readFileSync("src/components/ui/button.tsx", "utf8");

  it("default Button uses the strong fill and the non-lightening sheen", () => {
    const def = button.match(/default:\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
    expect(def).toMatch(/(^|\s)bg-primary-strong(\s|$)/);
    expect(def).toContain("bg-[image:var(--sheen-coral)]");
    expect(def).toContain("hover:bg-primary-strong-hover");
    expect(def).not.toMatch(/rgba\(255,\s*255,\s*255/);
  });

  it("Button focus uses the opaque focus ring with an offset", () => {
    expect(button).toContain("focus-visible:ring-focus-ring");
    expect(button).toContain("focus-visible:ring-offset-2");
    expect(button).not.toContain("focus-visible:ring-ring/50");
  });

  // A translucent ring colour (ring-x/NN) that can apply while the button is
  // focused replaces the shared ring-focus-ring (tailwind-merge drops the
  // base class, and dark: rules come later in the CSS). Only allowed when the
  // class is explicitly scoped away from focus with not-focus-visible:.
  function translucentFocusRings(source: string) {
    const block = source.match(/const buttonVariants = cva\(([\s\S]*?)\n\s*size:/)?.[1] ?? "";
    return [...block.matchAll(/"([^"]*)"/g)]
      .flatMap((m) => m[1].split(/\s+/))
      .filter((cls) => {
        const parts = cls.split(":");
        const utility = parts.pop() ?? "";
        return /^ring-[a-z-]+\/\d+$/.test(utility) && !parts.includes("not-focus-visible");
      });
  }

  it("no variant overrides the focus ring with a translucent ring colour", () => {
    expect(translucentFocusRings(button)).toEqual([]);
  });

  it("the check catches the old destructive and aria-invalid overrides", () => {
    const old = `const buttonVariants = cva(
  "focus-visible:ring-focus-ring aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  { variants: { variant: { destructive: "focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40" },
      size: {} } })`;
    expect(translucentFocusRings(old)).toEqual([
      "aria-invalid:ring-destructive/20",
      "dark:aria-invalid:ring-destructive/40",
      "focus-visible:ring-destructive/20",
      "dark:focus-visible:ring-destructive/40",
    ]);
  });

  it("old 20%-alpha ring fails 3:1 on white (why the focus ring changed)", () => {
    const old = composite({ ...color("light", "--primary"), a: 0.2 }, parseColor("#ffffff"));
    expect(contrastRatio(old, "#ffffff")).toBeLessThan(AA_NON_TEXT);
  });

  it("btn-coral paints the strong gradients", () => {
    const util = css.match(/@utility btn-coral \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(util).toContain("var(--gradient-coral-strong)");
    expect(util).toContain("var(--gradient-coral-strong-hover)");
    expect(util).toContain("var(--primary-strong)");
    expect(util).not.toMatch(/var\(--gradient-coral(-hover)?\)/);
  });

  // Coral circles that hold only a check icon (non-text, 3:1 is enough).
  const ICON_ONLY = new Set([
    "src/components/ui/checkbox.tsx",
    "src/components/ui/avatar.tsx",
    "src/app/founding-vendors/page.tsx",
    "src/components/share-profile.tsx",
    "src/components/budget-tracker.tsx",
  ]);
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : [];
    });
  }

  it("no class string pairs white text with the accent coral", () => {
    const offenders: string[] = [];
    for (const f of files("src")) {
      if (ICON_ONLY.has(f)) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/"([^"\n]*)"/g)) {
        const cls = m[1];
        if (!/(^|[\s:])text-(primary-foreground|white)(\s|$)/.test(cls)) continue;
        const accentFill = /(^|[\s:])bg-primary(\s|$)/.test(cls);
        const accentGradient = /var\(--gradient-coral(-hover)?\)/.test(cls);
        if (accentFill || accentGradient) offenders.push(`${f}: ${cls}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
