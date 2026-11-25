import { isE164Au } from "@/lib/phone-agent/phone";

// Phone agent configuration (server only: none of these are NEXT_PUBLIC_).
//
//   PHONE_AGENT_ENABLED=true     master switch; anything else = no calls, and the
//                                tool/webhook routes answer 503. The database's
//                                own mode (off / prototype / pilot) must agree.
//   RETELL_API_KEY               Retell API key WITH webhook signing enabled;
//                                used to dial and to verify Retell's signatures.
//   RETELL_AGENT_ID              the agent created by scripts/phone-agent/provision-retell.ts
//   PHONE_AGENT_FROM_NUMBER      our Australian caller ID (+61…), imported into Retell
//                                over Twilio SIP; it must accept return calls (s14).
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
//                                optional: send the registration link by SMS from the
//                                same number and receive STOP replies. Without them the
//                                agent offers email only.
//   PHONE_AGENT_LINK_BASE        defaults to https://evntly.au
//
// The voice agent itself never sees any of these, or any database key.

export type PhoneAgentConfig = {
  enabled: boolean;
  retellApiKey: string | null;
  retellAgentId: string | null;
  fromNumber: string | null;
  twilio: { sid: string; token: string } | null;
  linkBase: string;
};

export function phoneAgentConfig(env: Record<string, string | undefined> = process.env): PhoneAgentConfig {
  const from = env.PHONE_AGENT_FROM_NUMBER?.trim() ?? "";
  return {
    enabled: env.PHONE_AGENT_ENABLED === "true",
    retellApiKey: env.RETELL_API_KEY?.trim() || null,
    retellAgentId: env.RETELL_AGENT_ID?.trim() || null,
    fromNumber: isE164Au(from) ? from : null,
    twilio: env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN ? { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN } : null,
    linkBase: (env.PHONE_AGENT_LINK_BASE?.trim() || "https://evntly.au").replace(/\/+$/, ""),
  };
}

/** What's missing before a call can be placed (empty = ready). */
export function missingConfig(c: PhoneAgentConfig): string[] {
  const missing: string[] = [];
  if (!c.enabled) missing.push("PHONE_AGENT_ENABLED=true");
  if (!c.retellApiKey) missing.push("RETELL_API_KEY");
  if (!c.retellAgentId) missing.push("RETELL_AGENT_ID");
  if (!c.fromNumber) missing.push("PHONE_AGENT_FROM_NUMBER (+61…)");
  return missing;
}

/** The registration link for one call, attributed to it (?c=aicall-<ref>). */
export function registrationLink(base: string, campaign: string): string {
  const url = new URL("/become-a-vendor", base);
  url.searchParams.set("src", "direct_outreach");
  url.searchParams.set("c", campaign);
  return url.toString();
}
