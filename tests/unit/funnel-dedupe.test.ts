import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// signup_view and listing_started are one-off steps: a remount must not
// record them twice. Clicks and attempts are still sent every time.
const sent: unknown[] = [];
vi.mock("@/lib/meta-pixel", () => ({ metaPixelTrack: vi.fn() }));

function storage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
}

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("navigator", { sendBeacon: (_u: string, b: Blob) => (sent.push(b), true) });
  vi.stubGlobal("window", { location: { search: "" } });
  vi.stubGlobal("crypto", { randomUUID: () => "visitor-1" });
});
afterEach(() => vi.unstubAllGlobals());

const { trackFunnelEvent } = await import("@/lib/track-client");

describe("funnel step de-duplication", () => {
  it("records sign-up view and listing start once per session", () => {
    trackFunnelEvent("signup_view");
    trackFunnelEvent("signup_view");
    trackFunnelEvent("listing_started");
    trackFunnelEvent("listing_started");
    expect(sent).toHaveLength(2);
  });

  it("still records every claim click and sign-up attempt", () => {
    trackFunnelEvent("claim_click");
    trackFunnelEvent("claim_click");
    trackFunnelEvent("signup_attempt");
    trackFunnelEvent("signup_attempt");
    expect(sent).toHaveLength(4);
  });

  it("sends nothing under Do Not Track", () => {
    vi.stubGlobal("navigator", { doNotTrack: "1", sendBeacon: (_u: string, b: Blob) => (sent.push(b), true) });
    trackFunnelEvent("signup_view");
    expect(sent).toHaveLength(0);
  });
});
