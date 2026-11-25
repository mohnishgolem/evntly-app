import { z } from "zod";

// The phone agent's actions. The same definitions go to Retell (as custom
// functions pointed at /api/phone-agent/tool) and to the simulator.
// Every action runs through public.phone_agent_tool(), which enforces the
// rules (consent before sending, permanent opt-out, calling hours…) and only
// touches the one call it was given.

export type ToolName =
  | "opt_out"
  | "send_registration_link"
  | "request_assisted_listing"
  | "schedule_callback"
  | "check_transfer"
  | "record_outcome";

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required: string[] };

export const TOOL_DEFS: { name: ToolName; description: string; parameters: JsonSchema; speakDuring?: string }[] = [
  {
    name: "opt_out",
    description:
      "Use immediately when the person asks not to be contacted again, to be removed from the list, or to stop calling. Adds the number to Evntly's permanent do-not-call list.",
    parameters: { type: "object", properties: { reason: { type: "string", description: "Their words, briefly." } }, required: [] },
  },
  {
    name: "send_registration_link",
    description:
      "Send the Evntly vendor registration link by text message to the number you called, or by email. Only after they clearly agreed to receive it that way.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["sms", "email"] },
        email: { type: "string", description: "Required for email: the address they spelled out, read back and confirmed." },
        consent_confirmed: { type: "boolean", description: "true only if they said yes to receiving the link this way." },
        consent_quote: { type: "string", description: "What they said when agreeing, e.g. 'yeah, text it to me'." },
      },
      required: ["channel", "consent_confirmed", "consent_quote"],
    },
    speakDuring: "Sending that now.",
  },
  {
    name: "request_assisted_listing",
    description:
      "They'd like Evntly to prepare a free draft listing for them to check and approve. Only after they said yes.",
    parameters: {
      type: "object",
      properties: {
        permission_confirmed: { type: "boolean" },
        consent_quote: { type: "string", description: "What they said when agreeing." },
        email: { type: "string", description: "Where to send the private draft link, if they gave one (read back and confirmed)." },
        details: { type: "string", description: "Website or Instagram handle, services, suburbs, anything they mentioned." },
      },
      required: ["permission_confirmed", "consent_quote"],
    },
  },
  {
    name: "schedule_callback",
    description:
      "Book a callback from the owner at a day and time they chose. Weekdays 9am–8pm or Saturday 9am–5pm Sydney time only.",
    parameters: {
      type: "object",
      properties: {
        when: { type: "string", description: "ISO 8601 date-time with the Sydney offset, e.g. 2026-12-03T14:00:00+11:00." },
        notes: { type: "string", description: "What they want to talk about." },
      },
      required: ["when"],
    },
  },
  {
    name: "check_transfer",
    description: "Check whether the owner can take a live transfer right now. Use before transferring.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "record_outcome",
    description: "Record how the call went. Call once before ending any call that got past the greeting.",
    parameters: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: ["interested", "busy_call_later", "not_interested", "already_registered", "voicemail", "wrong_number", "transferred", "other"],
        },
        interest: { type: "string", enum: ["high", "medium", "low", "none"] },
        objections: { type: "array", items: { type: "string" }, description: "Short phrases, e.g. 'price', 'too busy', 'burnt by lead sites'." },
        summary: { type: "string", description: "One or two sentences for the owner." },
      },
      required: ["outcome", "interest", "summary"],
    },
  },
];

const email = z.string().trim().toLowerCase().email().max(254);

/** Shape checks before the database's own; keeps junk out of the logs. */
export const TOOL_ARGS: Record<ToolName, z.ZodType> = {
  opt_out: z.object({ reason: z.string().max(200).optional() }),
  send_registration_link: z.object({
    channel: z.enum(["sms", "email"]),
    email: email.optional(),
    consent_confirmed: z.boolean(),
    consent_quote: z.string().min(2).max(300),
  }).refine((a) => a.channel !== "email" || !!a.email, { message: "email is required for the email channel" }),
  request_assisted_listing: z.object({
    permission_confirmed: z.boolean(),
    consent_quote: z.string().min(1).max(300),
    email: email.optional(),
    details: z.string().max(1000).optional(),
  }),
  schedule_callback: z.object({ when: z.string().min(10).max(40), notes: z.string().max(1000).optional() }),
  check_transfer: z.object({}).passthrough(),
  record_outcome: z.object({
    outcome: z.enum(["interested", "busy_call_later", "not_interested", "already_registered", "voicemail", "wrong_number", "transferred", "other"]),
    interest: z.enum(["high", "medium", "low", "none"]),
    objections: z.array(z.string().max(60)).max(10).optional(),
    summary: z.string().max(2000),
  }),
};

export function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && value in TOOL_ARGS;
}

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export type LinkSender = (send: { channel: "sms" | "email"; to: string; campaign: string }) => Promise<{ ok: boolean; error?: string }>;

export type ToolResult = { ok: boolean; status: number; result: Record<string, unknown> };

/**
 * Runs one agent action: validates the arguments, calls the database (which
 * enforces the rules), and sends the registration link when the database says
 * to. Errors come back as a sentence for the agent to act on, never a stack.
 */
export async function runTool(
  deps: { rpc: Rpc; sendLink: LinkSender },
  call: { ref: string; providerCallId: string },
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  if (!isToolName(name)) return { ok: false, status: 400, result: { error: "Unknown action." } };
  const parsed = TOOL_ARGS[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, status: 200, result: { error: `Couldn't do that: ${parsed.error.issues.map((i) => i.message).join("; ")}` } };
  }
  const { data, error } = await deps.rpc("phone_agent_tool", {
    p_ref: call.ref,
    p_provider_call_id: call.providerCallId,
    p_tool: name,
    p_args: parsed.data,
  });
  if (error) {
    // Rule violations are messages for the agent ("Ask for permission first").
    return { ok: false, status: 200, result: { error: error.message } };
  }
  const result = (data ?? {}) as Record<string, unknown> & { send?: { channel: "sms" | "email"; to: string; campaign: string } };
  if (result.send) {
    const sent = await deps.sendLink(result.send);
    const { send: _send, ...rest } = result;
    void _send;
    return sent.ok
      ? { ok: true, status: 200, result: rest }
      : { ok: false, status: 200, result: { error: "The link couldn't be sent just now. Offer to have the owner send it, or a callback." } };
  }
  return { ok: true, status: 200, result };
}
