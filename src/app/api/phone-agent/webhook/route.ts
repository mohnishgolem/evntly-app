import { NextResponse, type NextRequest } from "next/server";
import { phoneAgentConfig } from "@/lib/phone-agent/config";
import { agentRpc, resolveCall } from "@/lib/phone-agent/server";
import { verifyRetellSignature } from "@/lib/phone-agent/signature";
import { payloadFor, type RetellCall } from "@/lib/phone-agent/webhooks";

// Retell call lifecycle webhooks: call_started, call_ended, call_analyzed and
// transfer events. Signature-checked like the tool route. Retell retries a
// non-2xx up to 3 times, so the database side is idempotent (a repeated
// call_ended is counted once). The transcript is passed through but the
// database only keeps it when recording is enabled and was consented to.

export async function POST(request: NextRequest) {
  const cfg = phoneAgentConfig();
  if (!cfg.enabled) return NextResponse.json({ error: "disabled" }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 2_000_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!verifyRetellSignature(cfg.retellApiKey ?? undefined, raw, request.headers.get("x-retell-signature"))) {
    console.warn("[phone-agent] webhook: invalid signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let body: { event?: unknown; call?: RetellCall };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const rpc = agentRpc();
  if (!rpc) return NextResponse.json({ error: "not configured" }, { status: 503 });
  // Calls we didn't start (e.g. a vendor calling our number back) aren't ours to log here.
  const ids = typeof body.event === "string" ? await resolveCall(rpc, body) : null;
  if (!ids) return NextResponse.json({ ignored: true });

  const { error } = await rpc("phone_agent_call_event", {
    p_ref: ids.ref,
    p_provider_call_id: ids.providerCallId,
    p_event: body.event,
    p_payload: payloadFor(body.call ?? {}),
  });
  console.info(`[phone-agent] webhook ${body.event} call=${ids.ref} ok=${!error}`);
  if (error) {
    // Unknown call / mismatched id: don't make Retell retry forever.
    const permanent = /Unknown call|mismatch/.test(error.message);
    return NextResponse.json({ error: permanent ? "rejected" : "failed" }, { status: permanent ? 200 : 500 });
  }
  return NextResponse.json({ ok: true });
}
