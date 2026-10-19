import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
const sendNotification = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => current.client }));
vi.mock("web-push", () => ({
  default: { sendNotification: (...a: unknown[]) => sendNotification(...a), generateVAPIDKeys: vi.fn() },
}));

const { isAllowedPushEndpoint, sendPushToUser } = await import("@/lib/push");

describe("push endpoints", () => {
  it("allows the real browser push services", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
  });

  it("refuses anything else (the server POSTs to this URL)", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evilpush.apple.com.attacker.net/")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });
});

describe("sendPushToUser", () => {
  it("sends to each device and removes subscriptions the push service says are gone", async () => {
    current = fakeSupabase({
      results: {
        app_settings: { data: [{ key: "vapid_public_key", value: "pub" }, { key: "vapid_private_key", value: "priv" }] },
        push_subscriptions: {
          data: [
            { id: "live", endpoint: "https://fcm.googleapis.com/fcm/send/1", p256dh: "k", auth: "a" },
            { id: "gone", endpoint: "https://fcm.googleapis.com/fcm/send/2", p256dh: "k", auth: "a" },
          ],
        },
      },
    });
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/2")) throw { statusCode: 410 };
    });
    await sendPushToUser("u1", { title: "New message", body: "Hi", url: "https://evil.example" });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload).toMatchObject({ title: "New message", body: "Hi", url: "/" });
    expect(current.writes).toEqual([{ table: "push_subscriptions", op: "delete", payload: undefined }]);
  });
});
