import { createHash, randomBytes } from "node:crypto";

// Invitation link tokens: 32 random bytes (256 bits), base64url in the link.
// Only the SHA-256 is stored (beta_invitations.token_hash), so a database
// read can't be turned into working links.
export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check before hashing anything from a URL. */
export function looksLikeInviteToken(value: string | null | undefined): value is string {
  return !!value && /^[A-Za-z0-9_-]{43}$/.test(value);
}
