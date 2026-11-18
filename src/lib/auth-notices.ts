// Messages the auth callback can send people to /login with. The query
// string only carries a key from this list, never text, so a crafted link
// can't put its own words on our login page.
export const AUTH_NOTICES = {
  "email-confirmed": {
    tone: "success",
    text: "Your email is confirmed. Log in to continue.",
  },
  "link-expired": {
    tone: "error",
    text: "That link has expired or was already used.",
    action: { label: "Request a new password reset link", href: "/forgot-password" },
  },
  "signup-link-used": {
    tone: "error",
    text: "That link was already used or has expired. If your email is confirmed, just log in below. If not, sign up again with the same email to get a new code.",
  },
  "signin-failed": {
    tone: "error",
    text: "We couldn't sign you in. Please try again.",
  },
} as const;

export type AuthNoticeKey = keyof typeof AUTH_NOTICES;

export function authNotice(key: string | undefined) {
  return key && Object.hasOwn(AUTH_NOTICES, key) ? AUTH_NOTICES[key as AuthNoticeKey] : null;
}

/** Sign-up with an email that already has an account (Supabase sends no code). */
export const EXISTING_ACCOUNT_MESSAGE =
  "You already have an Evntly account with this email. Log in instead, or use Continue with Google if that's how you signed up.";
