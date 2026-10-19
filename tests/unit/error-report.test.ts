import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
const { errorFingerprint, scrubPath } = await import("@/lib/error-report");

describe("error report helpers", () => {
  it("strips query strings and calendar-feed tokens from paths", () => {
    expect(scrubPath("/reset-password?code=secret123")).toBe("/reset-password");
    expect(scrubPath("/calendar-feed/abcdef123.ics")).toBe("/calendar-feed/[token]");
    expect(scrubPath(null)).toBeNull();
  });

  it("groups the same error across different ids and numbers", () => {
    const a = errorFingerprint({
      source: "server",
      route: "render /vendor/[id]",
      message: "Listing 4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8 not found after 3 tries",
    });
    const b = errorFingerprint({
      source: "server",
      route: "render /vendor/[id]",
      message: "Listing 151dc82e-11e7-44a2-a4dc-cea1c8bd6764 not found after 5 tries",
    });
    expect(a).toBe(b);
  });

  it("keeps different errors, routes and sources apart", () => {
    const base = { source: "server" as const, route: "render /x", message: "boom" };
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, message: "bang" }));
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, route: "render /y" }));
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, source: "client" }));
  });
});
