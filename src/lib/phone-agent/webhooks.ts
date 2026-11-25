import { createHmac } from "node:crypto";

// Pure helpers for the phone agent routes (kept out of route files, which may
// only export HTTP handlers).

export type RetellCall = {
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  disconnection_reason?: string;
  transcript?: string;
  call_cost?: { combined_cost?: number };
  call_analysis?: { call_summary?: string };
};

/** Retell call object → the payload phone_agent_call_event() expects. */
export function payloadFor(call: RetellCall) {
  return {
    start_timestamp: call.start_timestamp ?? null,
    end_timestamp: call.end_timestamp ?? null,
    duration_seconds: typeof call.duration_ms === "number" ? Math.round(call.duration_ms / 1000) : null,
    disconnection_reason: call.disconnection_reason ?? null,
    // Retell reports combined_cost in US cents.
    cost_usd_cents: typeof call.call_cost?.combined_cost === "number" ? Math.round(call.call_cost.combined_cost) : null,
    summary: call.call_analysis?.call_summary ?? null,
    transcript: call.transcript ?? null,
  };
}

/** Replies that mean "stop contacting me". */
export const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|opt[\s-]?out|remove me|don'?t (text|contact|call) me)\b/i;

/** Twilio's X-Twilio-Signature: base64 HMAC-SHA1 over the URL + sorted form fields. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data).digest("base64");
}
