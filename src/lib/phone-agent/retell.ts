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
 * scripts/phone-agent/provision-retell.ts.
 */
// Model: "claude-4.5-haiku" is in Retell's model list (checked 25 Nov 2026);
// "gpt-4.1-mini" is the cheaper fallback if latency or cost needs it.
export function retellLlmConfig(opts: { toolUrl: string; ownerTransferNumber: string | null; model?: string }) {
  return {
    model: opts.model ?? "claude-4.5-haiku",
    model_temperature: 0.3,
    start_speaker: "agent",
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

// Agent settings (https://docs.retellai.com/api-references/create-agent).
// Privacy is set at Retell, not just in our database:
//   data_storage_setting "basic_attributes_only" → no recording or transcript
//   is kept at Retell (only call metadata such as duration, cost, latency);
//   data_storage_retention_days 30 → even that metadata is deleted after 30 days.
export function retellAgentConfig(opts: { llmId: string; webhookUrl: string; voiceId: string; name?: string }) {
  return {
    agent_name: opts.name ?? "Evntly vendor recruitment (AI)",
    response_engine: { type: "retell-llm", llm_id: opts.llmId },
    voice_id: opts.voiceId,
    language: "en-AU",
    timezone: "Australia/Sydney",
    webhook_url: opts.webhookUrl,
    data_storage_setting: "basic_attributes_only",
    data_storage_retention_days: 30,
    // Natural turn-taking: quick replies, interruptible, light "mm-hm"s.
    responsiveness: 0.9,
    interruption_sensitivity: 0.8,
    enable_backchannel: true,
    backchannel_frequency: 0.6,
    // Vendors often answer from a van, a venue or a market stall.
    denoising_mode: "noise-and-background-speech-cancellation",
    begin_message_delay_ms: 500,
    end_call_after_silence_ms: 20_000,
    max_call_duration_ms: 6 * 60 * 1000,
    voicemail_option: { action: { type: "hangup" } },
  };
}

/**
 * Return calls to our number (Telemarketing Standard s14: the caller ID must
 * accept calls back for 30 days). A tiny agent that says who we are and puts
 * the caller through to Sai, so people can always reach a person, ask who we
 * are, or ask not to be called again.
 */
export function retellInboundLlmConfig(opts: { ownerName: string; ownerNumber: string; model?: string }) {
  return {
    model: opts.model ?? "claude-4.5-haiku",
    model_temperature: 0.2,
    begin_message: `Hi, you've reached Evntly. I'm Evntly's AI assistant. I'll put you through to ${opts.ownerName} now.`,
    general_prompt:
      `You are Evntly's AI assistant answering a call to Evntly's number. Say you're an AI if asked. Put the caller through to ${opts.ownerName} with transfer_to_owner straight after the greeting. ` +
      `If they only want to stop being contacted, say you'll make sure Evntly doesn't contact them again and still transfer so ${opts.ownerName} can record it, or end the call if they prefer. ` +
      `If the transfer fails, say ${opts.ownerName} will call them back and end the call. Never sell anything on this call.`,
    general_tools: [
      { type: "transfer_call", name: "transfer_to_owner", description: "Put the caller through to the owner.", transfer_destination: { type: "predefined", number: opts.ownerNumber }, transfer_option: { type: "cold_transfer", show_transferee_as_caller: true } },
      { type: "end_call", name: "end_call", description: "End the call politely." },
    ],
  };
}
