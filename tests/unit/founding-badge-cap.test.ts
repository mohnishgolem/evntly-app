import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Admin "Mark founding" respects the Founding Vendor capacity, like approvals
// through the beta. Real supabase-js client, network faked.
type Call = { url: string; method: string };
const calls: Call[] = [];
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

let capacity = 200;
let foundingCount = 3;
let alreadyFounding = false;
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push({ url, method });
  if (url.includes("/rpc/founding_vendor_places")) return json([{ capacity, approved: foundingCount, remaining: capacity - foundingCount }]);
  if (url.includes("/rest/v1/service_providers") && method === "HEAD") {
    return json(null, 200, { "Content-Range": `*/${foundingCount}` });
  }
  if (url.includes("/rest/v1/service_providers") && method === "GET") return json({ founding_vendor: alreadyFounding });
  if (url.includes("/rest/v1/service_providers") && method === "PATCH") return json([{ id: "v1" }]);
  return json(null);
});
const client = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/user", () => ({ getAdminSession: async () => ({ admin: true, mfa: "ok", session: { user: { id: "a1" } } }) }));
vi.mock("@/lib/email", () => ({ notify: vi.fn(), sendEmail: vi.fn() }));

const { setFoundingVendor } = await import("@/lib/actions/admin");
const patched = () => calls.filter((c) => c.method === "PATCH");

beforeEach(() => {
  calls.length = 0;
  capacity = 200;
  foundingCount = 3;
  alreadyFounding = false;
});

describe("setFoundingVendor and the 200-place cap", () => {
  it("marks a vendor founding while places remain", async () => {
    expect(await setFoundingVendor("v1", true)).toEqual({ success: true });
    expect(patched()).toHaveLength(1);
  });

  it("refuses once every place is taken", async () => {
    foundingCount = 200;
    const res = await setFoundingVendor("v1", true);
    expect(res?.error).toMatch(/All 200 Founding Vendor places are taken/);
    expect(patched()).toHaveLength(0);
  });

  it("still lets an already-founding vendor be saved, and anyone be removed", async () => {
    foundingCount = 200;
    alreadyFounding = true;
    expect(await setFoundingVendor("v1", true)).toEqual({ success: true });
    expect(await setFoundingVendor("v2", false)).toEqual({ success: true });
  });
});
