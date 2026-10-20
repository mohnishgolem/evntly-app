import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  clientIp: vi.fn(async () => "1.1.1.1"),
  RATE_LIMIT_ERROR: "Too many attempts.",
}));

const { acceptCurrentTerms } = await import("@/lib/actions/auth");
const { TERMS_VERSION } = await import("@/lib/config");

describe("Terms acceptance", () => {
  it("records the current Terms version through accept_terms()", async () => {
    current = fakeSupabase({ user: { id: "u1", email: "u1@example.invalid" } });
    expect(await acceptCurrentTerms()).toEqual({});
    expect(current.client.rpc).toHaveBeenCalledWith("accept_terms", { p_version: TERMS_VERSION });
  });

  it("uses a date-shaped version the DB accepts", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
