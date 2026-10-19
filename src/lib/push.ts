import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Web push. The VAPID key pair is generated here on first use and stored in
// app_settings (service role only), so the private key never needs to live
// in env vars or source control. Notifications are sent to every device a
// user has turned them on for; dead subscriptions (404/410) are removed.

export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

type VapidKeys = { publicKey: string; privateKey: string };
let cachedKeys: VapidKeys | null = null;
const VAPID_SUBJECT = "mailto:hello@evntlyapp.com";

async function loadVapidKeys(): Promise<VapidKeys | null> {
  if (cachedKeys) return cachedKeys;
  const admin = createAdminClient();
  if (!admin) return null;

  const read = async () => {
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", ["vapid_public_key", "vapid_private_key"]);
    const map = new Map((data ?? []).map((r) => [r.key, r.value]));
    const publicKey = map.get("vapid_public_key");
    const privateKey = map.get("vapid_private_key");
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  };

  let keys = await read();
  if (!keys) {
    // One statement inserts both halves, so concurrent first calls can't
    // end up with a mismatched pair: the loser's rows are ignored.
    const generated = webpush.generateVAPIDKeys();
    await admin.from("app_settings").upsert(
      [
        { key: "vapid_public_key", value: generated.publicKey },
        { key: "vapid_private_key", value: generated.privateKey },
      ],
      { onConflict: "key", ignoreDuplicates: true }
    );
    keys = await read();
  }
  cachedKeys = keys;
  return keys;
}

/** For the browser's pushManager.subscribe(); null if push isn't configured. */
export async function getVapidPublicKey() {
  return (await loadVapidKeys())?.publicKey ?? null;
}

// Push services browsers actually use. The server POSTs to the stored
// endpoint, so anything else is refused (no requests to arbitrary hosts).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^(updates\.)?push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

/** Never throws. Resolves once every device has been tried. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    const admin = createAdminClient();
    const keys = await loadVapidKeys();
    if (!admin || !keys) return;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!subs?.length) return;

    const body = JSON.stringify({
      title: payload.title.slice(0, 120),
      body: payload.body?.slice(0, 240),
      url: payload.url?.startsWith("/") ? payload.url : "/",
      tag: payload.tag,
    });
    const dead: string[] = [];
    await Promise.all(
      subs
        .filter((s) => isAllowedPushEndpoint(s.endpoint))
        .map((s) =>
          webpush
            .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
              TTL: 24 * 60 * 60,
              vapidDetails: { subject: VAPID_SUBJECT, ...keys },
            })
            .catch((err: { statusCode?: number }) => {
              if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.id);
              else console.error("[push] send failed:", err?.statusCode ?? err);
            })
        )
    );
    if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  } catch (err) {
    console.error("[push] failed:", err);
  }
}

/** Notifications are addressed by email; push needs the account behind it. */
export async function sendPushToEmail(email: string, payload: PushPayload) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: user } = await admin
    .from("users")
    .select("id")
    .ilike("email", email.replace(/[%_\\]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  if (user?.id) await sendPushToUser(user.id, payload);
}
