import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Blur must only ever sit on a background layer. On iOS Safari a
// backdrop-filter on an element that also holds text or icons can render that
// content soft, so: glass/frost put the blur on ::before, and backdrop-blur
// utilities are allowed only on full-screen overlay backdrops (no content).
const ALLOWED = new Set([
  "src/components/ui/sheet.tsx",
  "src/components/ui/dialog.tsx",
  "src/components/site/nav-drawer.tsx",
  "src/components/help/onboarding-walkthrough.tsx",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("no blur on foreground content", () => {
  it("uses backdrop-blur only on overlay backdrops", () => {
    const offenders = files("src").filter((f) => /backdrop-blur|backdrop-filter/.test(readFileSync(f, "utf8")) && !ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });

  it("overlay backdrops are empty layers below their panels", () => {
    for (const f of ALLOWED) {
      const src = readFileSync(f, "utf8");
      const backdrop = src.match(/fixed inset-0[^"]*?z-(\d+|\[\d+\])[^"]*?backdrop-blur/);
      expect(backdrop, f).not.toBeNull();
    }
  });

  it("glass and frost blur a ::before layer, never the element itself", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const glass = css.match(/\.glass-material \{([^}]*)\}/)?.[1] ?? "";
    expect(glass).not.toMatch(/backdrop-filter/);
    expect(css).toMatch(/\.glass-material::before \{[^}]*backdrop-filter/);
    const frost = css.match(/@utility frost \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(frost.split("&::before")[0]).not.toMatch(/backdrop-filter/);
    expect(frost).toMatch(/&::before \{[^}]*backdrop-filter/);
  });
});
