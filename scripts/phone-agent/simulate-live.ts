// Live simulation: a real model plays the phone agent (the exact prompt and
// tools uploaded to Retell) and another plays each vendor persona. Every
// action still runs through runTool() → phone_agent_tool() in an offline
// database, and every agent line is checked against the conversation rules.
// Costs a few cents of Claude API usage; makes no phone calls.
//
//   ANTHROPIC_API_KEY=... npx vite-node --config vitest.config.mts scripts/phone-agent/simulate-live.ts [scenario-id ...]
//
// PHONE_SIM_AGENT_MODEL (default claude-opus-5-5) plays the agent. Set it to
// claude-haiku-4-5 to mirror the model the Retell agent runs (claude-4.5-haiku).
// The vendor is played by claude-haiku-5-5.
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";
import { SCENARIOS } from "../../tests/fixtures/phone-agent-scenarios";
import { startSimulatedCall } from "../../tests/sql/phone-agent-db";
import { BEGIN_MESSAGE, callVariables, fill, retellDynamicVariables, SYSTEM_PROMPT } from "@/lib/phone-agent/prompt";
import { checkPolicy, renderTranscript, runConversation, type AgentEngine, type ToolCall, type TranscriptEntry } from "@/lib/phone-agent/simulator";
import { TOOL_DEFS } from "@/lib/phone-agent/tools";

const client = new Anthropic();
const AGENT_MODEL = process.env.PHONE_SIM_AGENT_MODEL ?? "claude-opus-5-5";
const VENDOR_MODEL = "claude-haiku-5-5";

const tools: Anthropic.Beta.BetaTool[] = [
  ...TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
  { name: "end_call", description: "Hang up after saying goodbye, or straight after confirming an opt-out.", input_schema: { type: "object", properties: {} } },
  { name: "transfer_to_owner", description: "Warm-transfer to the owner. Only after check_transfer said available and the person agreed.", input_schema: { type: "object", properties: {} } },
];

function agentEngine(system: string, begin: string): AgentEngine {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  let pendingToolUses: Anthropic.Beta.BetaToolUseBlock[] = [];
  let seenVendor = 0;

  async function ask() {
    const res = await client.beta.messages.create({
      model: AGENT_MODEL,
      max_tokens: 16000,
      system,
      tools,
      messages,
      output_config: { effort: "low" },
      // Server-side refusal fallback (the API re-runs a declined request on a fallback model).
      ...(AGENT_MODEL === "claude-opus-5-5" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal") throw new Error("Agent model refused.");
    messages.push({ role: "assistant", content: res.content });
    const say = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join(" ");
    pendingToolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    return { say, tools: pendingToolUses.map((b) => ({ name: b.name as ToolCall["name"], args: (b.input ?? {}) as Record<string, unknown> })) };
  }

  return {
    async next(transcript) {
      const vendorLines = transcript.filter((t) => t.who === "vendor") as { text: string }[];
      if (vendorLines.length === 0) {
        // Retell speaks the begin message itself; the model sees it as its own first turn.
        messages.push({ role: "user", content: "(The call connects.)" }, { role: "assistant", content: begin });
        return { say: begin, tools: [] };
      }
      const fresh = vendorLines.slice(seenVendor).map((v) => v.text).join(" ");
      seenVendor = vendorLines.length;
      messages.push({ role: "user", content: fresh });
      return ask();
    },
    async afterTools(transcript) {
      const results = transcript.filter((t) => t.who === "tool").slice(-pendingToolUses.length) as Extract<TranscriptEntry, { who: "tool" }>[];
      messages.push({
        role: "user",
        content: pendingToolUses.map((u, i) => ({
          type: "tool_result" as const,
          tool_use_id: u.id,
          content: JSON.stringify(results[i]?.result ?? {}),
          is_error: results[i] ? !results[i].ok : false,
        })),
      });
      const step = await ask();
      return step.say || step.tools.length ? step : null;
    },
  };
}

async function vendorTurn(persona: string, transcript: TranscriptEntry[]): Promise<string | null> {
  const spoken = transcript.filter((t) => t.who !== "tool") as { who: "agent" | "vendor"; text: string }[];
  if (spoken.filter((t) => t.who === "vendor").length >= 8) return null;
  const res = await client.messages.create({
    model: VENDOR_MODEL,
    max_tokens: 1000,
    output_config: { effort: "low" },
    system:
      `You are role-playing a Sydney event vendor answering a phone call. ${persona}\n` +
      "Reply with only what you'd say out loud: one or two short, natural sentences. If the call is clearly over (they said goodbye, you asked them to stop, or you were transferred), reply exactly [HANG UP].",
    messages: [{ role: "user", content: spoken.map((t) => `${t.who === "agent" ? "Caller" : "You"}: ${t.text}`).join("\n") + "\nYou:" }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
  return !text || text.includes("[HANG UP]") ? null : text;
}

async function main() {
  const only = process.argv.slice(2);
  const scenarios = SCENARIOS.filter((s) => !s.id.includes("guardrail") && (only.length === 0 || only.includes(s.id)));
  const out: string[] = [`# Live simulation (${AGENT_MODEL} as the agent, ${VENDOR_MODEL} as vendors), ${new Date().toISOString().slice(0, 16)}`, ""];
  let failed = 0;
  for (const s of scenarios) {
    const { call, rpc } = await startSimulatedCall(s);
    const vars = retellDynamicVariables(callVariables({ ref: call.ref, mode: s.mode, vendorName: s.vendorName, firstName: s.firstName, category: s.category, ownerName: "Sai", callbackNumber: "+61291234567", recordingOn: false }));
    const system = `${fill(SYSTEM_PROMPT, vars)}\n\nCurrent Sydney time: Wednesday 2 December 2026, 11:00am (AEDT, +11:00).`;
    const transcript = await runConversation({
      engine: agentEngine(system, fill(BEGIN_MESSAGE, vars)),
      vendor: (t) => vendorTurn(s.persona, t),
      call: { ref: call.ref, providerCallId: `live_${s.id}` },
      deps: { rpc, sendLink: async () => ({ ok: true }) },
    });
    const policy = checkPolicy(transcript);
    if (!policy.pass) failed++;
    console.log(`${policy.pass ? "PASS" : "FAIL"} ${s.id} ${policy.failures.join("; ")}`);
    out.push(`## ${s.id}: ${s.title} — ${policy.pass ? "pass" : "FAIL: " + policy.failures.join("; ")}`, "", "```text", renderTranscript(transcript), "```", "");
  }
  writeFileSync("docs/phone-agent/live-simulation-report.md", out.join("\n"));
  console.log(`Wrote docs/phone-agent/live-simulation-report.md (${scenarios.length - failed}/${scenarios.length} passed the rules).`);
}

main().catch((e) => {
  console.error(e instanceof Anthropic.APIError ? `Claude API ${e.status}: ${e.message}` : e);
  process.exit(1);
});
