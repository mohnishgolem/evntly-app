import { NextResponse, type NextRequest } from "next/server";
import { phoneAgentConfig } from "@/lib/phone-agent/config";
import { sendRegistrationLink } from "@/lib/phone-agent/send-link";
import { agentRpc, resolveCall } from "@/lib/phone-agent/server";
import { verifyRetellSignature } from "@/lib/phone-agent/signature";
import { runTool } from "@/lib/phone-agent/tools";

// Retell custom functions (the phone agent's actions) land here.
// 1. PHONE_AGENT_ENABLED must be true, else 503.
// 2. X-Retell-Signature must verify against the raw body (≤ 5 min old), else 401.
// 3. The call must carry our call_ref; the database binds it to Retell's call
//    id and refuses any other call, so a request can only affect its own call.
// The database decides everything else and its message goes back to the agent.
// Logs never include phone numbers, emails or what was said.

export async function POST(request: NextRequest) {
  const cfg = phoneAgentConfig();
  if (!cfg.enabled) return NextResponse.json({ error: "disabled" }, { status: 503 });

  const raw = await request.text();
  // Retell includes the call so far (with its transcript) in every request.
  if (raw.length > 1_000_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!verifyRetellSignature(cfg.retellApiKey ?? undefined, raw, request.headers.get("x-retell-signature"))) {
    console.warn("[phone-agent] tool: invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: { name?: unknown; args?: unknown; call?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const rpc = agentRpc();
  if (!rpc) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const ids = await resolveCall(rpc, body);
  if (!ids) return NextResponse.json({ error: "unknown call" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name : "";
  const out = await runTool({ rpc, sendLink: sendRegistrationLink }, ids, name, body.args);
  console.info(`[phone-agent] tool ${name} call=${ids.ref} ok=${out.ok}`);
  return NextResponse.json(out.result, { status: out.status });
}
