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
  "signin-failed": {
    tone: "error",
    text: "We couldn't sign you in. Please try again.",
  },
} as const;

export type AuthNoticeKey = keyof typeof AUTH_NOTICES;

export function authNotice(key: string | undefined) {
  return key && Object.hasOwn(AUTH_NOTICES, key) ? AUTH_NOTICES[key as AuthNoticeKey] : null;
}
