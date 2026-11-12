import { afterEach, describe, expect, it, vi } from "vitest";

// The Meta Pixel is prepared but must stay off: no script, no CSP hosts and
// no events until the privacy review flips the code flag AND the env is set
// AND the visitor consents.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Meta Pixel (prepared, inactive)", () => {
  it("is off even when the pixel id and enable flag are set, until the privacy review", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456789012345");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ENABLED", "true");
    const { metaPixelConfigured, META_PIXEL_PRIVACY_REVIEWED } = await import("@/lib/meta-pixel");
    expect(META_PIXEL_PRIVACY_REVIEWED).toBe(false);
    expect(metaPixelConfigured()).toBe(false);
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
