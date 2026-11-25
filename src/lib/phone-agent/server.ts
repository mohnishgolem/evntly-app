import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Rpc } from "@/lib/phone-agent/tools";

// The service-role client, narrowed to the four functions the voice
// provider's verified requests may run. Nothing else (no table access, no
// other RPCs) is reachable from the phone agent routes.
const AGENT_FUNCTIONS = new Set(["phone_agent_tool", "phone_agent_call_event", "phone_agent_sms_stop", "phone_agent_web_test_call"]);

export function agentRpc(): Rpc | null {
  const admin = createAdminClient();
  if (!admin) return null;
  const rpc = admin.rpc.bind(admin) as unknown as Rpc;
  return async (fn, args) => {
    if (!AGENT_FUNCTIONS.has(fn)) return { data: null, error: { message: "Not allowed." } };
    return rpc(fn, args);
  };
}

/** Our call reference and Retell's call id from a Retell payload. */
export function callIds(body: unknown): { ref: string; providerCallId: string } | null {
  const call = (body as { call?: { call_id?: unknown; metadata?: { call_ref?: unknown } } })?.call;
  const ref = call?.metadata?.call_ref;
  const id = call?.call_id;
  if (typeof ref !== "string" || !/^[a-z0-9]{10}$/.test(ref)) return null;
  if (typeof id !== "string" || id.length < 4 || id.length > 120) return null;
  return { ref, providerCallId: id };
}

/**
 * Our call reference for a Retell payload. Calls we dialled carry it in
 * metadata; a browser test call from the Retell dashboard doesn't, and gets a
 * prototype call row on first sight (prototype mode only, enforced in SQL).
 */
export async function resolveCall(rpc: Rpc, body: unknown): Promise<{ ref: string; providerCallId: string } | null> {
  const direct = callIds(body);
  if (direct) return direct;
  const call = (body as { call?: { call_id?: unknown; call_type?: unknown; retell_llm_dynamic_variables?: Record<string, unknown> } })?.call;
  if (call?.call_type !== "web_call" || typeof call.call_id !== "string" || call.call_id.length < 4 || call.call_id.length > 120) return null;
  const vars = call.retell_llm_dynamic_variables ?? {};
  const { data, error } = await rpc("phone_agent_web_test_call", {
    p_provider_call_id: call.call_id,
    p_vendor_name: typeof vars.vendor_name === "string" ? vars.vendor_name : null,
    p_category: typeof vars.category === "string" ? vars.category : null,
  });
  return error || typeof data !== "string" ? null : { ref: data, providerCallId: call.call_id };
}
