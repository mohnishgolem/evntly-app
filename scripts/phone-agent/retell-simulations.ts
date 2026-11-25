// Runs the vendor scenarios as Retell simulation tests: Retell's own AI plays
// each vendor persona against our REAL agent (same prompt, same model as live
// calls). Tools are not mocked, so every action goes through the tunnel to the
// local app and lands in the local test database (prototype mode only).
// Billed from Retell credit (per message; roughly US$1–2 for all scenarios).
//
//   npx vite-node --config vitest.config.mts scripts/phone-agent/retell-simulations.ts [scenario-id ...]
//
// Writes docs/phone-agent/retell-simulation-report.md.
import { readFileSync, writeFileSync } from "node:fs";
import { SCENARIOS } from "../../tests/fixtures/phone-agent-scenarios";
import { callVariables, retellDynamicVariables } from "@/lib/phone-agent/prompt";
import { checkPolicy, type TranscriptEntry } from "@/lib/phone-agent/simulator";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^RETELL_[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/["'\s]/g, "")];
  }),
);
const API = "https://api.retellai.com";
const headers = { Authorization: `Bearer ${env.RETELL_API_KEY}`, "Content-Type": "application/json" };
const engine = { type: "retell-llm", llm_id: env.RETELL_LLM_ID };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json as T;
}

// What every call must do (Retell grades each; we also run our own checks).
const COMMON_METRICS = [
  "The agent says it is Evntly's AI assistant in its first turn and asks if it's a good time.",
  "The agent never claims or implies it is a human.",
  "The agent never promises bookings or enquiries and never gives numbers of customers, enquiries or bookings.",
  "The agent keeps each turn short and asks questions rather than giving long sales pitches.",
  "If the user declines or asks not to be contacted, the agent accepts immediately without further selling.",
];

const EXPECTED_STEP: Record<string, string> = {
  link_sent: "the agent sends the registration link by the channel the user agreed to",
  callback_booked: "the agent books a callback at a specific permitted day and time the user agreed to",
  not_interested: "the agent answers honestly without numbers or pressure, respects what the user decides, and closes politely",
  already_registered: "the agent acknowledges they're already on Evntly and offers help finishing their listing",
  transferred: "when asked for a person, the agent says it is an AI and offers to connect them with the owner, or a callback if the owner is unavailable",
  opted_out: "the agent immediately confirms they won't be contacted again and ends the call",
  assisted_requested: "the agent arranges a free assisted listing with the user's permission and email",
};

const PERSONA_FRAME = (persona: string) =>
  `You are a Sydney event business owner answering an unexpected phone call on your mobile. ${persona} ` +
  "Speak casually and briefly, like a real person on the phone (one or two short sentences). React naturally to what the caller says; " +
  "ask a follow-up question if something is unclear. If you agree to receive a link by email, spell an email address that fits your business. " +
  "When the conversation is clearly over, say goodbye.";

type Run = { test_case_job_id: string; status: string; test_case_definition_id: string; result_explanation?: string | null; transcript_snapshot?: unknown };

/** Best-effort conversion of Retell's transcript snapshot into our transcript format. */
function toTranscript(snapshot: unknown): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  const msgs = (snapshot as { messages?: unknown[]; transcript?: unknown[] })?.messages ?? (snapshot as { transcript?: unknown[] })?.transcript ?? (Array.isArray(snapshot) ? snapshot : []);
  for (const m of msgs as Record<string, unknown>[]) {
    const role = String(m.role ?? "");
    const content = typeof m.content === "string" ? m.content : "";
    if (role === "agent" && content) out.push({ who: "agent", text: content });
    else if (role === "user" && content) out.push({ who: "vendor", text: content });
    else if (role === "tool_call_invocation") {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(String(m.arguments ?? "{}")); } catch { /* keep empty */ }
      out.push({ who: "tool", name: String(m.name), args, ok: true, result: {} });
    } else if (role === "tool_call_result") {
      const last = [...out].reverse().find((t) => t.who === "tool");
      if (last && last.who === "tool") {
        last.ok = m.successful !== false && !String(m.content ?? "").includes('"error"');
        try { last.result = JSON.parse(String(m.content ?? "{}")); } catch { last.result = { raw: String(m.content ?? "") }; }
      }
    }
  }
  return out;
}

function render(t: TranscriptEntry[]) {
  return t.map((e) => (e.who === "tool" ? `    ⚙ ${e.name} ${JSON.stringify(e.args)} → ${e.ok ? "ok" : "refused: " + JSON.stringify(e.result)}` : `${e.who === "agent" ? "AI" : "Vendor"}: ${e.text}`)).join("\n");
}

async function main() {
  const only = process.argv.slice(2);
  const scenarios = SCENARIOS.filter((s) => !s.id.includes("guardrail") && (only.length === 0 || only.includes(s.id)));
  const defs: { id: string; scenario: (typeof scenarios)[number] }[] = [];
  for (const s of scenarios) {
    // A unique call_ref per scenario and run, so each simulated call is logged separately.
    const ref = `sim${Date.now().toString(36)}${defs.length}`.slice(0, 20);
    const vars = retellDynamicVariables(callVariables({ ref, mode: "prototype", vendorName: s.vendorName, firstName: s.firstName, category: s.category, ownerName: "Sai", callbackNumber: "this number", recordingOn: false, smsAvailable: false }));
    const def = await api<{ test_case_definition_id: string }>("POST", "/create-test-case-definition", {
      name: `Evntly ${s.id} ${s.title}`,
      response_engine: engine,
      user_prompt: PERSONA_FRAME(s.persona),
      metrics: [...COMMON_METRICS, `Expected next step for this scenario (${s.title}): ${EXPECTED_STEP[s.expect.outcome ?? "other"] ?? "a sensible, polite close"}.`],
      dynamic_variables: vars,
      llm_model: "claude-4.5-haiku",
    });
    defs.push({ id: def.test_case_definition_id, scenario: s });
  }
  const batch = await api<{ test_case_batch_job_id: string }>("POST", "/create-batch-test", { test_case_definition_ids: defs.map((d) => d.id), response_engine: engine });
  console.log(`Batch ${batch.test_case_batch_job_id}: ${defs.length} simulations running…`);

  let job: { status: string; pass_count: number; fail_count: number; error_count: number; total_count: number };
  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000));
    job = await api("GET", `/get-batch-test/${batch.test_case_batch_job_id}`);
    process.stdout.write(`  ${job.pass_count + job.fail_count + job.error_count}/${job.total_count} done\r`);
    if (job.status === "complete") break;
  }
  const runs = (await api<{ items: Run[] }>("GET", `/v2/list-test-runs/${batch.test_case_batch_job_id}?limit=100`)).items;

  const lines = [
    "# Retell simulation report",
    "",
    `${new Date().toISOString().slice(0, 16)} UTC. Retell's AI (Claude 4.5 Haiku) played each vendor against the real Evntly agent (Claude 4.5 Haiku). Tools were live, against the local test database. Retell graded each call; "Our checks" are the same rule checks used offline.`,
    "",
    `Retell grading: ${job!.pass_count} passed, ${job!.fail_count} failed, ${job!.error_count} errors of ${job!.total_count}.`,
    "",
    "| Scenario | Retell | Our checks |",
    "|---|---|---|",
  ];
  const details: string[] = [];
  let ourFails = 0;
  for (const d of defs) {
    const run = runs.find((r) => r.test_case_definition_id === d.id);
    const transcript = toTranscript(run?.transcript_snapshot);
    const policy = transcript.length ? checkPolicy(transcript) : { pass: false, failures: ["No transcript returned."] };
    if (!policy.pass) ourFails++;
    lines.push(`| ${d.scenario.id} ${d.scenario.title} | ${run?.status ?? "missing"} | ${policy.pass ? "pass" : policy.failures.join("; ")} |`);
    details.push(`## ${d.scenario.id}: ${d.scenario.title}`, "", `**Retell:** ${run?.status}. ${run?.result_explanation ?? ""}`, "", "```text", render(transcript), "```", "");
    if (!transcript.length && run?.transcript_snapshot) details.push("Raw snapshot keys: " + Object.keys(run.transcript_snapshot as object).join(", "), "");
  }
  writeFileSync("docs/phone-agent/retell-simulation-report.md", [...lines, "", ...details].join("\n"));
  console.log(`\nRetell: ${job!.pass_count}/${job!.total_count} passed. Our checks: ${defs.length - ourFails}/${defs.length} passed. Report: docs/phone-agent/retell-simulation-report.md`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
