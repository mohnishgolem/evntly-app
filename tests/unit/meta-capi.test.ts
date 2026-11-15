import { beforeEach, describe, expect, it, vi } from "vitest";

// Meta Conversions API: CompleteRegistration is sent once per vendor, only
// with consent, with no personal data, and with the same event id the browser
// pixel uses (deduplication). The network is faked at fetch; nothing reaches Meta.
const PIXEL = "123456789012345";
vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", PIXEL);
vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ENABLED", "true");
vi.stubEnv("META_CAPI_ACCESS_TOKEN", "test-token-not-real");

type Sent = { url: string; init: RequestInit; body: Record<string, unknown> };
const sent: Sent[] = [];
let reply = new Response("{}", { status: 200 });
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  sent.push({ url: String(input), init: init ?? {}, body: JSON.parse(String(init?.body ?? "{}")) });
  return reply.clone();
});
vi.stubGlobal("fetch", fakeFetch);

let jar: Record<string, string> = {};
const setCookies: { name: string; value: string; opts: Record<string, unknown> }[] = [];
let reqHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined),
    set: (name: string, value: string, opts: Record<string, unknown>) => setCookies.push({ name, value, opts }),
  }),
  headers: async () => reqHeaders,
}));

const { recordVendorRegistration, registrationEventId, completeRegistrationPayload, capiEnabled } = await import("@/lib/meta-capi");

const URL_CLAIM = "https://evntlyapp.com/founding-vendors/claim?src=meta_ads";

beforeEach(() => {
  sent.length = 0;
  setCookies.length = 0;
  jar = { evntly_ad_consent: "granted", _fbp: "fb.1.1763100000000.1234567890" };
  reqHeaders = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 Instagram 356.0" });
  reply = new Response("{}", { status: 200 });
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "");
});

describe("recordVendorRegistration", () => {
  it("sends one CompleteRegistration with the shared event id and no personal data", async () => {
    expect(await recordVendorRegistration("user-uuid-1", URL_CLAIM)).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(`https://graph.facebook.com/v21.0/${PIXEL}/events`);
    expect((sent[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-token-not-real");
    // Token never in the URL.
    expect(sent[0].url).not.toContain("token");
    const event = (sent[0].body.data as Record<string, unknown>[])[0];
    expect(event).toMatchObject({
      event_name: "CompleteRegistration",
      event_id: registrationEventId("user-uuid-1"),
      action_source: "website",
      event_source_url: URL_CLAIM,
    });
    expect(event.user_data).toEqual({ client_ip_address: "203.0.113.7", client_user_agent: "Mozilla/5.0 Instagram 356.0", fbp: "fb.1.1763100000000.1234567890" });
    const text = JSON.stringify(sent[0].body);
    for (const field of ['"em"', '"ph"', '"fn"', '"ln"', '"external_id"', "user-uuid-1", "@"]) expect(text).not.toContain(field);
    // The browser pixel gets the same id, briefly.
    expect(setCookies).toEqual([
      { name: "evntly_reg_evt", value: registrationEventId("user-uuid-1"), opts: expect.objectContaining({ maxAge: 600, httpOnly: false }) },
    ]);
  });

  it("sends nothing without consent, when declined, or when the pixel or token is off", async () => {
    jar = {};
    expect(await recordVendorRegistration("u", URL_CLAIM)).toEqual({ sent: false });
    jar = { evntly_ad_consent: "denied" };
    expect(await recordVendorRegistration("u", URL_CLAIM)).toEqual({ sent: false });
    jar = { evntly_ad_consent: "granted" };
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "");
    expect(await recordVendorRegistration("u", URL_CLAIM)).toEqual({ sent: false });
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "test-token-not-real");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ENABLED", "false");
    expect(await recordVendorRegistration("u", URL_CLAIM)).toEqual({ sent: false });
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ENABLED", "true");
    expect(sent).toHaveLength(0);
    expect(setCookies).toHaveLength(0);
  });

  it("drops malformed Meta cookies and unknown IPs instead of forwarding them", async () => {
    jar = { evntly_ad_consent: "granted", _fbp: "<script>", _fbc: "fb.1.1763100000000.IwAR-click_id" };
    reqHeaders = new Headers({ "user-agent": "UA" });
    await recordVendorRegistration("u2", URL_CLAIM);
    const event = (sent[0].body.data as Record<string, unknown>[])[0];
    expect(event.user_data).toEqual({ client_user_agent: "UA", fbc: "fb.1.1763100000000.IwAR-click_id" });
  });

  it("adds the Events Manager test code only when configured", async () => {
    vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "TEST12345");
    await recordVendorRegistration("u3", URL_CLAIM);
    expect(sent[0].body.test_event_code).toBe("TEST12345");
  });

  it("never throws or blocks sign-up when Meta errors or is unreachable", async () => {
    reply = new Response('{"error":{}}', { status: 400 });
    expect(await recordVendorRegistration("u4", URL_CLAIM)).toEqual({ sent: false });
    fakeFetch.mockRejectedValueOnce(new Error("network down"));
    expect(await recordVendorRegistration("u4", URL_CLAIM)).toEqual({ sent: false });
  });
});

describe("event ids and gates", () => {
  it("is stable per account, different across accounts, and doesn't reveal the id", () => {
    expect(registrationEventId("a")).toBe(registrationEventId("a"));
    expect(registrationEventId("a")).not.toBe(registrationEventId("b"));
    expect(registrationEventId("abc-123")).toMatch(/^reg_[a-f0-9]{32}$/);
    expect(registrationEventId("abc-123")).not.toContain("abc");
  });

  it("builds a payload with only the allowed user_data fields", () => {
    const p = completeRegistrationPayload({ eventId: "reg_x", eventTime: 1, sourceUrl: "https://evntlyapp.com/", userData: { client_ip_address: "", fbp: undefined } });
    expect(p.data[0].user_data).toEqual({});
    expect("test_event_code" in p).toBe(false);
  });

  it("requires consent for the server side too", () => {
    expect(capiEnabled("granted")).toBe(true);
    expect(capiEnabled(undefined)).toBe(false);
    expect(capiEnabled("denied")).toBe(false);
  });
});
