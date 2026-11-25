// Creates (or prints) Evntly's Retell AI agent from the same prompt and tools
// the simulator tests.
//
//   Dry run (default): writes docs/phone-agent/retell-agent.json, calls nothing.
//     npx vite-node --config vitest.config.mts scripts/phone-agent/provision-retell.ts
//
//   Apply (ONLY with Sai's approval; creates objects in the Retell account):
//     RETELL_API_KEY=... PHONE_AGENT_PUBLIC_URL=https://evntly.au \
//     RETELL_VOICE_ID=<an Australian English voice from the Retell dashboard> \
//     OWNER_TRANSFER_NUMBER=+614... \
//     npx vite-node --config vitest.config.mts scripts/phone-agent/provision-retell.ts --apply
//
// Then set RETELL_AGENT_ID to the printed agent id. Importing the Australian
// Twilio number (Elastic SIP trunk → sip.retellai.com) is done in the Retell
// dashboard: Phone Numbers → Add number → Import via SIP trunking.
import { mkdirSync, writeFileSync } from "node:fs";
import { retellAgentConfig, retellLlmConfig } from "@/lib/phone-agent/retell";

const apply = process.argv.includes("--apply");
const base = (process.env.PHONE_AGENT_PUBLIC_URL ?? "https://evntly.au").replace(/\/+$/, "");
const llm = retellLlmConfig({
  toolUrl: `${base}/api/phone-agent/tool`,
  ownerTransferNumber: process.env.OWNER_TRANSFER_NUMBER ?? "+61400000000",
  model: process.env.RETELL_MODEL,
});
const agentFor = (llmId: string) =>
  retellAgentConfig({ llmId, webhookUrl: `${base}/api/phone-agent/webhook`, voiceId: process.env.RETELL_VOICE_ID ?? "<choose an en-AU voice>" });

async function post(path: string, body: unknown) {
  const res = await fetch(`https://api.retellai.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RETELL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json as Record<string, string>;
}

async function main() {
  if (!apply) {
    mkdirSync("docs/phone-agent", { recursive: true });
    writeFileSync("docs/phone-agent/retell-agent.json", JSON.stringify({ llm, agent: agentFor("<llm_id>") }, null, 2) + "\n");
    console.log("Dry run: wrote docs/phone-agent/retell-agent.json. Nothing was sent to Retell.");
    return;
  }
  if (!process.env.RETELL_API_KEY || !process.env.RETELL_VOICE_ID || !process.env.OWNER_TRANSFER_NUMBER) {
    throw new Error("Set RETELL_API_KEY, RETELL_VOICE_ID and OWNER_TRANSFER_NUMBER.");
  }
  const createdLlm = await post("/create-retell-llm", llm);
  const agent = await post("/create-agent", agentFor(createdLlm.llm_id));
  console.log(`Created Retell LLM ${createdLlm.llm_id} and agent ${agent.agent_id}. Set RETELL_AGENT_ID=${agent.agent_id}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
