import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// "Continue" on /auth/confirm posts to this route, which answers with a
// full-page (303) redirect. It must refuse posts from other sites.
const destination = vi.fn<(f: FormData) => Promise<string>>(async () => "/vendor/0f0f0f0f-0000-4000-8000-00000000000a?book=1&src=share_link");
vi.mock("@/lib/actions/auth", () => ({ confirmEmailLinkDestination: (f: FormData) => destination(f) }));

const { POST } = await import("@/app/auth/confirm/continue/route");

const post = (headers: Record<string, string>) => {
  const body = new URLSearchParams({ token_hash: "pkce_" + "a".repeat(24), type: "signup", next: "/vendor/x?book=1" });
  return POST(new NextRequest("https://evntlyapp.com/auth/confirm/continue", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", ...headers } }));
};

beforeEach(() => destination.mockClear());

describe("POST /auth/confirm/continue", () => {
  it("uses the token and redirects to the destination with a full page load", async () => {
    const res = await post({ "sec-fetch-site": "same-origin", origin: "null" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://evntlyapp.com/vendor/0f0f0f0f-0000-4000-8000-00000000000a?book=1&src=share_link");
    expect(destination).toHaveBeenCalledOnce();
    expect(destination.mock.calls[0][0].get("type")).toBe("signup");
  });

  it("accepts a same-origin post from browsers without Sec-Fetch-Site", async () => {
    expect((await post({ origin: "https://evntlyapp.com" })).status).toBe(303);
    expect(destination).toHaveBeenCalledOnce();
  });

  it("refuses posts from other sites without using the token", async () => {
    const attempts: Record<string, string>[] = [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { origin: "https://evil.example" }];
    for (const headers of attempts) {
      const res = await post(headers);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("https://evntlyapp.com/login?notice=signin-failed");
    }
    expect(destination).not.toHaveBeenCalled();
  });
});
