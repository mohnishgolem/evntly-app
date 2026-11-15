import { afterEach, describe, expect, it, vi } from "vitest";

// The Meta Pixel ships switched off: no script, no CSP hosts and no events
// until the deploy sets the pixel id AND the enable flag, AND the visitor
// presses Allow on the ad-measurement banner (privacy review done in the PR
// that added the banner and the privacy policy paragraph).
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Meta Pixel (off unless switched on)", () => {
  it("is off without the env, and needs both the pixel id and the enable flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ENABLED", "");
    let m = await import("@/lib/meta-pixel");
    expect(m.metaPixelConfigured()).toBe(false);
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456789012345");
    m = await import("@/lib/meta-pixel");
    expect(m.metaPixelConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ENABLED", "true");
    expect(m.META_PIXEL_PRIVACY_REVIEWED).toBe(true);
    expect(m.metaPixelConfigured()).toBe(true);
  });

  it("adds no Facebook hosts to the CSP while off", async () => {
    const { buildCsp } = await import("@/lib/csp");
    expect(buildCsp("n", false)).not.toMatch(/facebook/);
    // And would add them only when switched on.
    expect(buildCsp("n", false, true)).toMatch(/script-src[^;]*https:\/\/connect\.facebook\.net/);
  });

  it("never fires events while off", async () => {
    const fbq = vi.fn();
    vi.stubGlobal("window", { fbq });
    const { metaPixelTrack } = await import("@/lib/meta-pixel");
    metaPixelTrack("Lead");
    metaPixelTrack("CompleteRegistration");
    expect(fbq).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
