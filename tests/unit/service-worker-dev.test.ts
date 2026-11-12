import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Runs public/sw.js against a fake worker global and reports what it does.
const SOURCE = readFileSync(join(__dirname, "../../public/sw.js"), "utf8");

function loadWorker(origin: string, existingCaches: string[]) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const deleted: string[] = [];
  const fakeCaches = {
    keys: async () => existingCaches,
    delete: async (key: string) => (deleted.push(key), true),
    open: async () => ({ match: async () => undefined, put: async () => {}, keys: async () => [] }),
  };
  const self = {
    location: new URL(origin),
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  new Function("self", "caches", "fetch", SOURCE)(self, fakeCaches, vi.fn());

  return {
    deleted,
    async activate() {
      let done: Promise<unknown> = Promise.resolve();
      listeners.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
      await done;
    },
    /** True when the worker takes over the request (serves it from cache logic). */
    intercepts(path: string, mode = "no-cors") {
      const respondWith = vi.fn();
      listeners.fetch({ request: { method: "GET", url: `${origin}${path}`, mode }, respondWith, waitUntil: () => {} });
      return respondWith.mock.calls.length > 0;
    },
  };
}

describe("service worker on local dev hosts", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://evntly.localhost:3000"])(
    "never intercepts or caches on %s",
    (origin) => {
      const sw = loadWorker(origin, []);
      expect(sw.intercepts("/_next/static/chunks/app.js")).toBe(false);
      expect(sw.intercepts("/", "navigate")).toBe(false);
    },
  );

  it("clears caches a dev browser already holds", async () => {
    const sw = loadWorker("http://localhost:3000", ["evntly-static-v1", "evntly-shell-v1"]);
    await sw.activate();
    expect(sw.deleted.sort()).toEqual(["evntly-shell-v1", "evntly-static-v1"]);
  });
});

describe("service worker in production", () => {
  it("still caches build files and the launch page", () => {
    const sw = loadWorker("https://evntlyapp.com", []);
    expect(sw.intercepts("/_next/static/immutable/chunks/app.js")).toBe(true);
    expect(sw.intercepts("/", "navigate")).toBe(true);
    expect(sw.intercepts("/explore", "navigate")).toBe(false);
  });

  it("keeps its caches and drops only unknown ones", async () => {
    const sw = loadWorker("https://evntlyapp.com", ["evntly-static-v1", "evntly-shell-v1", "old-cache"]);
    await sw.activate();
    expect(sw.deleted).toEqual(["old-cache"]);
  });
});
