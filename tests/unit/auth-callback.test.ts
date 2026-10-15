import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    ...current.client,
    auth: { ...current.client.auth, exchangeCodeForSession: vi.fn(async () => ({ error: null })) },
  }),
}));

const { GET } = await import("@/app/auth/callback/route");

async function locationFor(query: string) {
  const res = await GET(new Request(`https://evntly.example/auth/callback?code=abc&${query}`));
  return res.headers.get("location");
}

describe("auth callback redirects", () => {
  it("blocks open redirects through ?next", async () => {
    current = fakeSupabase({ user: { id: "u1", email: "u1@example.invalid" } });
    for (const next of ["@evil.com", "//evil.com", "https://evil.com", "/%09/evil.com"]) {
      const loc = await locationFor(`next=${encodeURIComponent(next)}`);
      expect(new URL(loc!).host).toBe("evntly.example");
    }
  });

  it("keeps same-site next (password reset flow)", async () => {
    current = fakeSupabase({ user: { id: "u1", email: "u1@example.invalid" } });
    expect(await locationFor("next=/reset-password")).toBe("https://evntly.example/reset-password");
  });

  it("sends MFA-enrolled accounts to the second factor step", async () => {
    current = fakeSupabase({ user: { id: "u1", email: "u1@example.invalid" }, aal: "aal1", nextAal: "aal2" });
    expect(await locationFor("")).toBe("https://evntly.example/login/mfa?next=%2Fdashboard");
  });
});
