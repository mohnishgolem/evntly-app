// Creates or updates Evntly's Retell AI agents from the same prompt and tools
// the simulator tests.
//
//   Dry run (default): writes docs/phone-agent/retell-agent.json, calls nothing.
//     npx vite-node --config vitest.config.mts scripts/phone-agent/provision-retell.ts
//
//   Apply (creates objects in Sai's Retell account; costs nothing until a call):
//     npx vite-node --config vitest.config.mts scripts/phone-agent/provision-retell.ts --apply
//   reading from the environment (.env.local is NOT read automatically; export them):
//     RETELL_API_KEY            Retell API key with webhook signing
//     PHONE_AGENT_PUBLIC_URL    where Retell sends tool calls/webhooks (the local tunnel for testing)
//     RETELL_VOICE_ID           chosen voice (see scripts/phone-agent/voices.ts)
//     OWNER_TRANSFER_NUMBER     Sai's mobile, +614… (optional: without it there's no live transfer)
//     RETELL_LLM_ID / RETELL_AGENT_ID   if set, those are UPDATED instead of creating new ones
//     RETELL_MODEL              default claude-4.5-haiku
//     --inbound                 also create the return-call agent (needs the AU number first)
import { mkdirSync, writeFileSync } from "node:fs";
import { retellAgentConfig, retellInboundLlmConfig, retellLlmConfig } from "@/lib/phone-agent/retell";

const apply = process.argv.includes("--apply");
const inbound = process.argv.includes("--inbound");
const env = process.env;
const base = (env.PHONE_AGENT_PUBLIC_URL ?? "https://evntly.au").replace(/\/+$/, "");
// No transfer tool until Sai's number is set (the agent offers a callback instead).
const owner = env.OWNER_TRANSFER_NUMBER || null;
const llm = retellLlmConfig({ toolUrl: `${base}/api/phone-agent/tool`, ownerTransferNumber: owner, model: env.RETELL_MODEL });
const agentFor = (llmId: string) =>
  retellAgentConfig({ llmId, webhookUrl: `${base}/api/phone-agent/webhook`, voiceId: env.RETELL_VOICE_ID ?? "<choose a voice>" });

async function call(method: "POST" | "PATCH", path: string, body: unknown) {
  const res = await fetch(`https://api.retellai.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.RETELL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json as Record<string, string>;
}

async function main() {
  if (!apply) {
    mkdirSync("docs/phone-agent", { recursive: true });
    writeFileSync("docs/phone-agent/retell-agent.json", JSON.stringify({ llm, agent: agentFor("<llm_id>") }, null, 2) + "\n");
    console.log("Dry run: wrote docs/phone-agent/retell-agent.json. Nothing was sent to Retell.");
    return;
  }
  for (const k of ["RETELL_API_KEY", "RETELL_VOICE_ID", "PHONE_AGENT_PUBLIC_URL"]) {
    if (!env[k]) throw new Error(`Set ${k}.`);
  }
  const llmId = env.RETELL_LLM_ID
    ? (await call("PATCH", `/update-retell-llm/${env.RETELL_LLM_ID}`, llm), env.RETELL_LLM_ID)
    : (await call("POST", "/create-retell-llm", llm)).llm_id;
  const agentId = env.RETELL_AGENT_ID
    ? (await call("PATCH", `/update-agent/${env.RETELL_AGENT_ID}`, agentFor(llmId)), env.RETELL_AGENT_ID)
    : (await call("POST", "/create-agent", agentFor(llmId))).agent_id;
  console.log(`Outbound agent ready: RETELL_LLM_ID=${llmId} RETELL_AGENT_ID=${agentId}`);

  if (inbound) {
    if (!owner) throw new Error("Set OWNER_TRANSFER_NUMBER for the return-call agent.");
    const inLlm = await call("POST", "/create-retell-llm", retellInboundLlmConfig({ ownerName: "Sai", ownerNumber: owner, model: env.RETELL_MODEL }));
    const inAgent = await call("POST", "/create-agent", {
      ...agentFor(inLlm.llm_id),
      agent_name: "Evntly return calls (AI → Sai)",
      webhook_url: null,
    });
    console.log(`Return-call agent: ${inAgent.agent_id} (set it as the inbound agent on the Australian number)`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
