import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// reportClientError keeps per-page state (dedupe + cap), so load a fresh copy each test.
async function load() {
  vi.resetModules();
  return (await import("@/lib/client-error")).reportClientError;
}

let beacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  beacon = vi.fn(() => true);
  vi.stubGlobal("window", { location: { pathname: "/founding-vendors" } });
  vi.stubGlobal("navigator", { sendBeacon: beacon });
});

afterEach(() => vi.unstubAllGlobals());

function errorWith(message: string, stack: string) {
  const e = new Error(message);
  e.stack = stack;
  return e;
}

describe("reportClientError ignore list", () => {
  it("drops the Instagram in-app browser bridge error (logged 15 Nov on /founding-vendors)", async () => {
    const report = await load();
    report(
      errorWith(
        "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
        "sendDataToNative@https://evntlyapp.com/founding-vendors:1:1142\n" +
          "sendPageHideMessage@https://evntlyapp.com/founding-vendors:1:3712\n" +
          "@https://evntlyapp.com/founding-vendors:1:5421",
      ),
    );
    expect(beacon).not.toHaveBeenCalled();
  });

  it("still reports genuine Evntly errors", async () => {
    const report = await load();
    report(
      errorWith(
        "Cannot read properties of undefined (reading 'name')",
        "TypeError: Cannot read properties of undefined (reading 'name')\n    at VendorCard (https://evntlyapp.com/_next/static/immutable/chunks/abc.js:1:200)",
      ),
    );
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("still reports errors that merely mention messageHandlers (e.g. the map library)", async () => {
    const report = await load();
    report(
      errorWith(
        "Could not find function messageHandlers.getTile",
        "Actor.process@https://evntlyapp.com/maplibre/maplibre-gl-shared.mjs:5:100",
      ),
    );
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});
