// The last few calls Retell handled for our agent (browser tests and phone
// calls): status, why it ended, length, cost and response latency. Read-only.
//
//   npx vite-node --config vitest.config.mts scripts/phone-agent/recent-calls.ts
//
// Reads RETELL_API_KEY and RETELL_AGENT_ID from .env.local.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^RETELL_[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/["'\s]/g, "")];
  }),
);

type Call = {
  call_id: string; call_type: string; call_status: string; agent_id?: string; disconnection_reason?: string;
  start_timestamp?: number; duration_ms?: number; call_cost?: { combined_cost?: number }; latency?: { e2e?: { p50?: number } };
};

async function main() {
  const res = await fetch("https://api.retellai.com/v3/list-calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RETELL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 15, sort_order: "descending" }),
  });
  const body = (await res.json()) as { items?: Call[]; message?: string };
  if (!res.ok) throw new Error(`list-calls ${res.status}: ${body.message ?? ""}`);
  const calls = (body.items ?? []).filter((c) => !env.RETELL_AGENT_ID || c.agent_id === env.RETELL_AGENT_ID);
  if (!calls.length) return console.log("No calls yet.");
  for (const c of calls) {
    const when = c.start_timestamp ? new Date(c.start_timestamp).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : "—";
    console.log([
      when, c.call_type, c.call_status, c.disconnection_reason ?? "",
      c.duration_ms != null ? `${Math.round(c.duration_ms / 1000)}s` : "",
      c.call_cost?.combined_cost != null ? `US$${(c.call_cost.combined_cost / 100).toFixed(3)}` : "",
      c.latency?.e2e?.p50 != null ? `p50 ${Math.round(c.latency.e2e.p50)}ms` : "",
    ].join("  "));
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
