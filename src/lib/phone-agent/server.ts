import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Rpc } from "@/lib/phone-agent/tools";

// The service-role client, narrowed to the three functions the voice
// provider's verified requests may run. Nothing else (no table access, no
// other RPCs) is reachable from the phone agent routes.
const AGENT_FUNCTIONS = new Set(["phone_agent_tool", "phone_agent_call_event", "phone_agent_sms_stop"]);

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
