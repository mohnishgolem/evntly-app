import { createHmac, timingSafeEqual } from "node:crypto";

// Retell signs every webhook and custom-function request:
//   X-Retell-Signature: v=<unix ms timestamp>,d=<hex HMAC-SHA256(rawBody + timestamp, apiKey)>
// keyed with a Retell API key that has webhook signing enabled.
// https://docs.retellai.com/features/secure-webhook
// We reject anything unsigned, mis-signed or older than 5 minutes (replays).

const TOLERANCE_MS = 5 * 60 * 1000;

export function signRetell(apiKey: string, body: string, timestampMs = Date.now()): string {
  const digest = createHmac("sha256", apiKey).update(body + String(timestampMs)).digest("hex");
  return `v=${timestampMs},d=${digest}`;
}

export function verifyRetellSignature(apiKey: string | undefined, body: string, header: string | null, nowMs = Date.now()): boolean {
  if (!apiKey || !header) return false;
  const match = /^v=(\d{10,16}),d=([0-9a-f]{64})$/.exec(header.trim());
  if (!match) return false;
  const ts = Number(match[1]);
  // Accept seconds or milliseconds; Retell sends milliseconds.
  const tsMs = ts < 1e12 ? ts * 1000 : ts;
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > TOLERANCE_MS) return false;
  const expected = createHmac("sha256", apiKey).update(body + match[1]).digest();
  const given = Buffer.from(match[2], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
