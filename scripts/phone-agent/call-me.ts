// Prototype: place one real call from the AI agent to an approved number,
// against the LOCAL / staging database (never production). The database
// re-checks every rule (prototype allow-list, hours, budget, one call at a time).
//
//   npx vite-node --config vitest.config.mts scripts/phone-agent/call-me.ts +614XXXXXXXX [vendor name] [category]
//
// Reads: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (must point at
// localhost or a host containing "staging"), RETELL_API_KEY, RETELL_AGENT_ID,
// PHONE_AGENT_FROM_NUMBER. Example (vendor role-play): "Harbour Lens Photography" photographer
import { createClient } from "@supabase/supabase-js";
import { phoneAgentConfig } from "@/lib/phone-agent/config";
import { toE164 } from "@/lib/phone-agent/phone";
import { callVariables } from "@/lib/phone-agent/prompt";
import { createRetellCall } from "@/lib/phone-agent/retell";

async function main() {
  const [, , to, vendorName, category] = process.argv;
  const phone = toE164(to);
  if (!phone) throw new Error("Usage: call-me.ts +614XXXXXXXX [vendor name] [category]");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url) && !url.includes("staging")) {
    throw new Error(`Refusing to run against ${url || "(unset)"}: local or staging only.`);
  }
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const cfg = phoneAgentConfig({ ...process.env, PHONE_AGENT_ENABLED: "true" });
  if (!cfg.retellApiKey || !cfg.retellAgentId || !cfg.fromNumber) throw new Error("Set RETELL_API_KEY, RETELL_AGENT_ID and PHONE_AGENT_FROM_NUMBER.");

  const started = await db.rpc("phone_start_call" as never, { p_prospect_id: null, p_phone: phone, p_actor: null } as never);
  if (started.error) throw new Error(started.error.message);
  const row = (started.data as unknown as { call_id: string; ref: string; mode: "prototype" | "pilot" }[])[0];
  const { data: s } = await db.from("phone_agent_settings" as never).select("owner_name, recording_enabled").maybeSingle();
  const settings = (s ?? {}) as { owner_name?: string; recording_enabled?: boolean };

  const vars = callVariables({
    ref: row.ref,
    mode: row.mode,
    vendorName: vendorName ?? "your business",
    category: category ?? "photographer",
    ownerName: settings.owner_name ?? "Sai",
    callbackNumber: cfg.fromNumber,
    recordingOn: !!settings.recording_enabled,
  });
  const res = await createRetellCall({ apiKey: cfg.retellApiKey, agentId: cfg.retellAgentId, from: cfg.fromNumber, to: phone, vars });
  await db.rpc("phone_call_dialed" as never, { p_call_id: row.call_id, p_provider_call_id: "callId" in res ? res.callId : null, p_error: "error" in res ? res.error : null, p_actor: null } as never);
  if ("error" in res) throw new Error(res.error);
  console.log(`Calling ${phone} now (ref ${row.ref}). Results land in phone_calls when the call ends.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
