import { beforeEach, describe, expect, it, vi } from "vitest";

// Browser side of Meta measurement: the visitor's choice, DNT/GPC, and the
// one-time hand-off of the registration event id. A tiny fake document and
// navigator stand in for the browser.
vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456789012345");
vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ENABLED", "true");

let cookieStore: Record<string, string> = {};
const fakeDocument = {
  get cookie() {
    return Object.entries(cookieStore)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  },
  set cookie(line: string) {
    const [pair, ...attrs] = line.split("; ");
    const [k, v] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
    if (attrs.some((a) => a === "max-age=0")) delete cookieStore[k];
    else cookieStore[k] = v;
  },
};
const nav: { doNotTrack?: string; globalPrivacyControl?: boolean } = {};
const events: string[] = [];
const fbqCalls: unknown[][] = [];
vi.stubGlobal("document", fakeDocument);
vi.stubGlobal("navigator", nav);
vi.stubGlobal("location", { protocol: "https:", hostname: "evntlyapp.com" });
vi.stubGlobal("window", { dispatchEvent: (e: Event) => events.push(e.type), fbq: (...a: unknown[]) => fbqCalls.push(a) });

const m = await import("@/lib/meta-pixel");

beforeEach(() => {
  cookieStore = {};
  delete nav.doNotTrack;
  delete nav.globalPrivacyControl;
  events.length = 0;
  fbqCalls.length = 0;
});

describe("ad measurement consent", () => {
  it("asks first, then remembers Allow or No thanks", () => {
    expect(m.adConsentChoice()).toBeUndefined();
    expect(m.hasMarketingConsent()).toBe(false);
    m.setAdConsent("granted");
    expect(m.adConsentChoice()).toBe("granted");
    expect(events).toEqual([m.AD_CONSENT_EVENT]);
    m.setAdConsent("denied");
    expect(m.hasMarketingConsent()).toBe(false);
  });

  it("treats Do Not Track and Global Privacy Control as no", () => {
    cookieStore.evntly_ad_consent = "granted";
    nav.doNotTrack = "1";
    expect(m.adConsentChoice()).toBe("denied");
    delete nav.doNotTrack;
    nav.globalPrivacyControl = true;
    expect(m.hasMarketingConsent()).toBe(false);
  });

  it("removes Meta's cookies and stops a running pixel when someone says no", () => {
    cookieStore = { _fbp: "fb.1.1.1", _fbc: "fb.1.1.x", evntly_reg_evt: "reg_" + "c".repeat(32) };
    m.setAdConsent("denied");
    expect(cookieStore).toEqual({ evntly_ad_consent: "denied" });
    expect(fbqCalls).toContainEqual(["consent", "revoke"]);
  });

  it("Ad choices withdraws an earlier Allow and asks again", () => {
    m.setAdConsent("granted");
    cookieStore._fbp = "fb.1.1.1";
    m.resetAdConsent();
    expect(m.adConsentChoice()).toBeUndefined();
    expect(cookieStore._fbp).toBeUndefined();
    expect(fbqCalls).toContainEqual(["consent", "revoke"]);
  });

  it("fires nothing without consent, and the registration with its shared id with consent", () => {
    m.metaPixelTrack("CompleteRegistration", "reg_" + "a".repeat(32));
    expect(fbqCalls).toEqual([]);
    m.setAdConsent("granted");
    m.metaPixelTrack("CompleteRegistration", "reg_" + "a".repeat(32));
    // "Allow" re-grants a pixel that was revoked earlier on this page, then the event goes out once.
    expect(fbqCalls).toEqual([["consent", "grant"], ["track", "CompleteRegistration", {}, { eventID: "reg_" + "a".repeat(32) }]]);
  });
});

describe("registration event id hand-off", () => {
  it("is read once and then deleted", () => {
    cookieStore.evntly_reg_evt = "reg_" + "b".repeat(32);
    expect(m.takeRegistrationEventId()).toBe("reg_" + "b".repeat(32));
    expect(m.takeRegistrationEventId()).toBeUndefined();
  });

  it("ignores anything that isn't an event id", () => {
    cookieStore.evntly_reg_evt = "someone@example.com";
    expect(m.takeRegistrationEventId()).toBeUndefined();
  });
});
