// Email links for sign-up confirmation and password reset land on
// /auth/confirm, which only uses the one-time token when the person presses
// Continue (a POST). Email security scanners open every link in a message
// (a GET) the moment it arrives; with the old links that GET used the token
// up, so the person's own tap and their 6-digit code both failed as
// "expired" (18 Nov 2026: a vendor's link was opened by a scanner 13 s
// after sign-up). The token_hash link also works on any device or browser,
// unlike the PKCE link, which only worked in the browser that asked for it.
//
// Pure, so the parsing rules are unit-tested.

import { safeNextPath } from "@/lib/safe-redirect";

export const CONFIRM_LINK_TYPES = ["signup", "email", "recovery"] as const;
export type ConfirmLinkType = (typeof CONFIRM_LINK_TYPES)[number];

export type ConfirmLink = { tokenHash: string; type: ConfirmLinkType; next: string | null };

/**
 * Reads the link's query string. The email template passes Supabase's
 * {{ .RedirectTo }} (our /auth/callback URL with `next` in it) as
 * `redirect_to`; only its same-site `next` path is kept.
 */
export function parseConfirmLink(params: Record<string, string | string[] | undefined>): ConfirmLink | null {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : undefined;
  };
  const tokenHash = one("token_hash");
  const type = one("type");
  if (!tokenHash || !/^[A-Za-z0-9_-]{8,256}$/.test(tokenHash)) return null;
  if (!type || !(CONFIRM_LINK_TYPES as readonly string[]).includes(type)) return null;

  let next = one("next") ?? null;
  const redirectTo = one("redirect_to");
  if (!next && redirectTo) {
    try {
      next = new URL(redirectTo).searchParams.get("next");
    } catch {
      next = null;
    }
  }
  const safe = next ? safeNextPath(next, "") : "";
  return { tokenHash, type: type as ConfirmLinkType, next: safe || null };
}
