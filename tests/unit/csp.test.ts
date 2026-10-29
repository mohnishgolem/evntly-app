import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "@/lib/csp";

describe("Content-Security-Policy", () => {
  const csp = buildCsp("abc123", false);
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(name + " ")) ?? "";

  it("only runs scripts carrying this request's nonce (no unsafe-inline/eval in prod)", () => {
    expect(directive("script-src")).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com"
    );
    expect(directive("script-src")).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows eval only in development", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });

  it("locks down plugins, framing, base and form targets", () => {
    for (const d of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
      expect(csp).toContain(d);
    }
    expect(directive("form-action")).toContain("https://accounts.google.com");
  });

  it("frames only Stripe's payment form", () => {
    expect(directive("frame-src")).toBe(
      "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com"
    );
    expect(directive("connect-src")).toContain("https://api.stripe.com");
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
