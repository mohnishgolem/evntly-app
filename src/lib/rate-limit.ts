import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-side rate limits for abuse-prone actions (login, signup, password
// reset, messages, quotes, reports). Supabase Auth's own per-IP limits only
// ever see Vercel's egress IPs (server actions call Auth from the server), so
// they can't tell one visitor from another — these limits use the visitor's
// real IP and/or user id instead.
//
// Counters live in public.rate_limit_buckets behind the check_rate_limit()
// RPC, which only the service role can execute. If the RPC isn't deployed
// (or the service key is missing) the check fails OPEN and logs, so a
// missing migration never locks everyone out of logging in.

export type RateLimitRule = { max: number; windowSeconds: number };

export const RATE_LIMITS = {
  // Per IP: brute-force / credential stuffing.
  loginIp: { max: 20, windowSeconds: 15 * 60 },
  // Per target email: slows guessing one account from many IPs, but
  // generous enough that it can't easily be used to lock a victim out.
  loginEmail: { max: 10, windowSeconds: 15 * 60 },
  signupIp: { max: 5, windowSeconds: 60 * 60 },
  passwordResetIp: { max: 5, windowSeconds: 60 * 60 },
  passwordResetEmail: { max: 3, windowSeconds: 60 * 60 },
  mfaVerifyUser: { max: 10, windowSeconds: 15 * 60 },
  messageUser: { max: 30, windowSeconds: 60 },
  quoteUser: { max: 20, windowSeconds: 60 * 60 },
  reportUser: { max: 10, windowSeconds: 60 * 60 },
  reviewUser: { max: 10, windowSeconds: 60 * 60 },
  // Browser error reports (/api/client-errors), per IP.
  clientErrorIp: { max: 20, windowSeconds: 10 * 60 },
} satisfies Record<string, RateLimitRule>;

export const RATE_LIMIT_ERROR = "Too many attempts. Please wait a few minutes and try again.";

/** Hash identifiers so raw IPs/emails are never stored in the buckets table. */
export function bucketKey(scope: string, identifier: string): string {
  const digest = createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
  return `${scope}:${digest.slice(0, 32)}`;
}

/**
 * The visitor's IP. On Vercel, x-forwarded-for is set by the platform edge
 * (client-supplied values are overwritten), and its first entry is the client.
 */
export function clientIpFrom(h: Headers): string {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}

/** Returns true when the action is allowed (and records the attempt). */
export async function checkRateLimit(
  scope: keyof typeof RATE_LIMITS,
  identifier: string
): Promise<boolean> {
  const rule = RATE_LIMITS[scope];
  const admin = createAdminClient();
  if (!admin) return true;

  // A limiter fault must never take down login/messaging, so any failure —
  // network, missing RPC, or a thrown error — fails open and is logged.
  try {
    // check_rate_limit isn't in the generated types yet. Call it as a method
    // on the client: a detached `admin.rpc` loses `this` and throws.
    const { data, error } = await (
      admin as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
      }
    ).rpc("check_rate_limit", {
      p_key: bucketKey(scope, identifier),
      p_max: rule.max,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      console.warn(`rate limit check failed open (${scope}): ${error.message}`);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error(`rate limit check threw, failing open (${scope}):`, err);
    return true;
  }
}
