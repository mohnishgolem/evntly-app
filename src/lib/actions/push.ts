"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedPushEndpoint } from "@/lib/push";

export type PushActionState = { error?: string; success?: boolean };

type SubscriptionJson = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function savePushSubscription(
  subscription: SubscriptionJson,
  userAgent: string
): Promise<PushActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to turn on notifications." };

  const endpoint = subscription.endpoint ?? "";
  const p256dh = subscription.keys?.p256dh ?? "";
  const auth = subscription.keys?.auth ?? "";
  if (!isAllowedPushEndpoint(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return { error: "This browser's push service isn't supported." };
  }

  const row = { endpoint, p256dh, auth, user_agent: userAgent.slice(0, 300) };
  let { error } = await supabase.from("push_subscriptions").insert(row);
  if (error?.code === "23505") {
    // Same device, previously signed in as someone else (or re-subscribing):
    // the endpoint now belongs to this user.
    const admin = createAdminClient();
    await admin?.from("push_subscriptions").delete().eq("endpoint", endpoint);
    ({ error } = await supabase.from("push_subscriptions").insert(row));
  }
  if (error) return { error: "Couldn't turn on notifications. Try again." };
  return { success: true };
}

export async function removePushSubscription(endpoint: string): Promise<PushActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };
  // RLS limits the delete to the caller's own rows.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { success: true };
}
