import type { TranscriptEntry } from "@/lib/phone-agent/simulator";

// Per-minute rate card for the chosen stack, in US cents (official pricing
// pages, read 25 Nov 2026; see docs/phone-agent/README.md):
//   Retell voice infrastructure 5.5¢ + Retell platform voice (TTS) 1.5¢
//   + Claude 4.5 Haiku on Retell 2.5¢ + Twilio AU outbound to a mobile 7.5¢
//   (Twilio Elastic SIP AU mobile termination is listed at 7.1¢; we use the
//   higher Voice rate to be safe). Retell charges no telephony fee for an
//   imported SIP number.
export const RATE_USD_CENTS_PER_MIN = { voiceInfra: 5.5, tts: 1.5, llm: 2.5, telephony: 7.5 };
export const USD_CENTS_PER_MIN = Object.values(RATE_USD_CENTS_PER_MIN).reduce((a, b) => a + b, 0); // 17¢
export const USD_TO_AUD = 1.55;

/** Rough length from what was said (~2.6 words/second plus a pause per turn), and its cost. */
export function estimateCallCost(transcript: TranscriptEntry[]): { seconds: number; usdCents: number } {
  const spoken = transcript.filter((t) => t.who !== "tool") as { text: string }[];
  const words = spoken.reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
  const seconds = Math.round(words / 2.6 + spoken.length * 1.2 + 4); // + ring/connect
  // Billed per second.
  return { seconds, usdCents: Math.round((seconds / 60) * USD_CENTS_PER_MIN) };
}
