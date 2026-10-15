import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "@/lib/csp";

describe("Content-Security-Policy", () => {
  const csp = buildCsp("abc123", false);
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(name + " ")) ?? "";

  it("only runs scripts carrying this request's nonce (no unsafe-inline/eval in prod)", () => {
    expect(directive("script-src")).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows eval only in development", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });

  it("locks down plugins, framing, base and form targets", () => {
    for (const d of ["object-src 'none'", "frame-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
      expect(csp).toContain(d);
    }
    expect(directive("form-action")).toContain("https://accounts.google.com");
  });

  it("allows the map tiles and the MapLibre worker", () => {
    expect(directive("connect-src")).toContain("https://tiles.openfreemap.org");
    expect(directive("worker-src")).toBe("worker-src 'self' blob:");
  });

  it("generates a fresh, unguessable nonce each time", () => {
    const a = generateNonce();
    expect(a).not.toBe(generateNonce());
    expect(atob(a)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
