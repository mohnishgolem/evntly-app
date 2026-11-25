import { BEGIN_MESSAGE, SYSTEM_PROMPT, type CallVariables, retellDynamicVariables } from "@/lib/phone-agent/prompt";
import { TOOL_DEFS } from "@/lib/phone-agent/tools";

// Retell AI REST calls (https://docs.retellai.com/api-references). Only our
// server talks to Retell; the API key never leaves it.

const API = "https://api.retellai.com";

type Fetch = typeof fetch;

/** Ask Retell to dial. Returns Retell's call id, or an error sentence. */
export async function createRetellCall(
  opts: { apiKey: string; agentId: string; from: string; to: string; vars: CallVariables },
  fetchImpl: Fetch = fetch,
): Promise<{ callId: string } | { error: string }> {
  try {
    const res = await fetchImpl(`${API}/v2/create-phone-call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from_number: opts.from,
        to_number: opts.to,
        override_agent_id: opts.agentId,
        // Our reference: every webhook and tool call carries it back.
        metadata: { call_ref: opts.vars.call_ref, mode: opts.vars.call_mode },
        retell_llm_dynamic_variables: retellDynamicVariables(opts.vars),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { call_id?: string; message?: string; error_message?: string };
    if (!res.ok || !body.call_id) return { error: `Retell ${res.status}: ${body.message ?? body.error_message ?? "no call id"}`.slice(0, 200) };
    return { callId: body.call_id };
  } catch (e) {
    return { error: `Retell request failed: ${(e as Error).message}`.slice(0, 200) };
  }
}

/**
 * The Retell LLM + agent definition. Uploaded once (and on changes) by
 * scripts/phone-agent/provision-retell.ts. Recording/transcript storage is
 * opted out: nothing sensitive is kept at Retell by default.
 */
export function retellLlmConfig(opts: { toolUrl: string; ownerTransferNumber: string | null; model?: string }) {
  return {
    model: opts.model ?? "claude-4.5-haiku",
    model_temperature: 0.3,
    general_prompt: SYSTEM_PROMPT,
    begin_message: BEGIN_MESSAGE,
    general_tools: [
      ...TOOL_DEFS.map((t) => ({
        type: "custom",
        name: t.name,
        description: t.description,
        url: opts.toolUrl,
        method: "POST",
        parameters: t.parameters,
        speak_during_execution: !!t.speakDuring,
        execution_message_description: t.speakDuring,
        speak_after_execution: true,
        timeout_ms: 10_000,
      })),
      { type: "end_call", name: "end_call", description: "Hang up after saying goodbye, or straight after confirming an opt-out." },
      ...(opts.ownerTransferNumber
        ? [{
            type: "transfer_call",
            name: "transfer_to_owner",
            description: "Warm-transfer to the owner. Only after check_transfer said available and the person agreed.",
            transfer_destination: { type: "predefined", number: opts.ownerTransferNumber },
            transfer_option: { type: "warm_transfer", show_transferee_as_caller: false },
          }]
        : []),
    ],
  };
}

export function retellAgentConfig(opts: { llmId: string; webhookUrl: string; voiceId: string; name?: string }) {
  return {
    agent_name: opts.name ?? "Evntly vendor recruitment (AI)",
    response_engine: { type: "retell-llm", llm_id: opts.llmId },
    voice_id: opts.voiceId,
    language: "en-AU",
    webhook_url: opts.webhookUrl,
    // No recordings or transcripts kept at Retell until legal review (NSW SDA).
    opt_out_sensitive_data_storage: true,
    end_call_after_silence_ms: 20_000,
    max_call_duration_ms: 6 * 60 * 1000,
    voicemail_option: { action: { type: "hangup" } },
    enable_backchannel: true,
    interruption_sensitivity: 0.8,
    post_call_analysis_data: [],
  };
}
