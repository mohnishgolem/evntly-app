import { describe, expect, it } from "vitest";
import { checkPolicy, type TranscriptEntry } from "@/lib/phone-agent/simulator";
import { signRetell, verifyRetellSignature } from "@/lib/phone-agent/signature";
import { formatAu, toE164 } from "@/lib/phone-agent/phone";
import { registrationLink } from "@/lib/phone-agent/config";
import { runTool } from "@/lib/phone-agent/tools";
import { STOP_WORDS, twilioSignature, payloadFor } from "@/lib/phone-agent/webhooks";
import { SYSTEM_PROMPT, EVNTLY_FACTS } from "@/lib/phone-agent/prompt";
import { opening } from "../fixtures/phone-agent-scenarios";

const open = opening({ mode: "pilot", vendorName: "Harbour Lens", category: "photographer" });
const agent = (text: string): TranscriptEntry => ({ who: "agent", text });
const vendor = (text: string): TranscriptEntry => ({ who: "vendor", text });
const tool = (name: string, ok = true): TranscriptEntry => ({ who: "tool", name, args: {}, ok, result: {} });
const record = tool("record_outcome");

describe("conversation rules catch violations", () => {
  const fails = (t: TranscriptEntry[]) => checkPolicy(t).failures.join(" | ");

  it("passes a clean call", () => {
    expect(checkPolicy([agent(open), vendor("Not interested, thanks."), agent("No worries, thanks for your time."), record, tool("end_call")]).failures).toEqual([]);
  });
  it("opening must disclose AI, Evntly and purpose", () => {
    expect(fails([agent("Hi, it's Sarah from Evntly, how are you?"), vendor("Fine"), record])).toMatch(/AI assistant.*purpose|AI assistant/);
  });
  it("no demand numbers, guarantees or human claims", () => {
    expect(fails([agent(open), vendor("?"), agent("We've got 500 couples searching every week."), record])).toMatch(/demand numbers/);
    expect(fails([agent(open), vendor("?"), agent("You're guaranteed bookings in the first month."), record])).toMatch(/guarantee/);
    expect(fails([agent(open), vendor("?"), agent("We get thousands of enquiries."), record])).toMatch(/exaggerates/);
    expect(fails([agent(open), vendor("Are you a real person?"), agent("Yes, I'm a real person, my name is Jess."), record])).toMatch(/claims to be human.*|didn't say it's an AI/);
    expect(fails([agent(open), vendor("?"), agent("I can't guarantee any bookings, honestly."), record])).toBe("");
    expect(fails([agent(open), vendor("?"), agent("Just so you know, this call is recorded."), record])).toMatch(/recorded/);
  });
  it("link only after a yes; opt-out ends the call", () => {
    expect(fails([agent(open), vendor("Hmm, maybe."), tool("send_registration_link"), record])).toMatch(/without a clear yes/);
    expect(fails([agent(open), vendor("Don't call me again."), agent("Okay, but it's free and..."), record])).toMatch(/opt_out wasn't used/);
    expect(fails([agent(open), vendor("Take me off your list"), tool("opt_out"), agent("Done."), agent("But the listing is free!"), tool("end_call")])).toMatch(/Kept talking|Pitched/);
    expect(fails([agent(open), vendor("Take me off your list"), tool("opt_out"), agent("Done, sorry to bother you.")])).toMatch(/Didn't end the call/);
  });
  it("short turns, no repeated pitch, no selling after a no", () => {
    const long = Array(70).fill("word").join(" ");
    expect(fails([agent(open), vendor("ok"), agent(long), record])).toMatch(/Turn too long/);
    expect(fails([agent("Hi, it's Evntly's AI assistant calling about listing your business, and I want to tell you everything about everything we offer to vendors in Sydney today and tomorrow and next week too, plus all the extra things we are planning to build over the coming months for you ok?"), vendor("ok"), record])).toMatch(/Opening is/);
    const pitch = "customers send their date suburb guest count and budget so you can quote properly";
    expect(fails([agent(open), vendor("ok"), agent(pitch), vendor("hmm"), agent("Like I said, " + pitch), record])).toMatch(/Repeats itself/);
    expect(fails([agent(open), vendor("Not interested, thanks."), agent("But it's free, and Founding Vendors are shown first!"), record])).toMatch(/Kept selling/);
  });
  it("outcome must be recorded", () => {
    expect(fails([agent(open), vendor("Sure"), agent("Bye"), tool("end_call")])).toMatch(/record the outcome/);
  });
});

describe("prompt", () => {
  it("never carries demand claims and keeps the honest wording", () => {
    expect(SYSTEM_PROMPT).toMatch(/You are an AI/);
    expect(EVNTLY_FACTS).toMatch(/can't promise any enquiries or bookings/);
    expect(SYSTEM_PROMPT).not.toMatch(/\b\d{3,}\s*(customers|couples|enquiries)/);
    expect(SYSTEM_PROMPT.length).toBeLessThan(14_000); // Retell bills longer prompts (>4k tokens) as extra time
  });
});

describe("signatures", () => {
  const key = "key_test_123";
  const body = JSON.stringify({ event: "call_ended", call: { call_id: "c1" } });
  it("accepts Retell's signature and rejects tampering, other keys and replays", () => {
    const now = 1_790_000_000_000;
    const sig = signRetell(key, body, now);
    expect(verifyRetellSignature(key, body, sig, now + 1000)).toBe(true);
    expect(verifyRetellSignature(key, body + " ", sig, now)).toBe(false);
    expect(verifyRetellSignature("other", body, sig, now)).toBe(false);
    expect(verifyRetellSignature(key, body, sig, now + 6 * 60_000)).toBe(false);
    expect(verifyRetellSignature(key, body, null, now)).toBe(false);
    expect(verifyRetellSignature(undefined, body, sig, now)).toBe(false);
  });
  it("Twilio signature is URL + sorted params", () => {
    const a = twilioSignature("tok", "https://evntly.au/api/phone-agent/sms", { From: "+61411222333", Body: "STOP" });
    expect(a).toBe(twilioSignature("tok", "https://evntly.au/api/phone-agent/sms", { Body: "STOP", From: "+61411222333" }));
    expect(a).not.toBe(twilioSignature("tok", "https://evntly.au/api/phone-agent/sms", { From: "+61411222333", Body: "stop!" }));
  });
  it("STOP words", () => {
    for (const w of ["STOP", "stop please", "Unsubscribe", "opt out", "Don't text me"]) expect(STOP_WORDS.test(w)).toBe(true);
    for (const w of ["Thanks!", "When can we talk?", "Unstoppable"]) expect(STOP_WORDS.test(w)).toBe(false);
  });
});

describe("helpers", () => {
  it("normalises Australian numbers only", () => {
    expect(toE164("0411 222 333")).toBe("+61411222333");
    expect(toE164("+61 2 9123 4567")).toBe("+61291234567");
    expect(toE164("(02) 9123 4567")).toBe("+61291234567");
    expect(toE164("1300 123 456")).toBeNull();
    expect(toE164("+1 415 555 0100")).toBeNull();
    expect(formatAu("+61411222333")).toBe("0411 222 333");
  });
  it("registration link is attributed to the call", () => {
    expect(registrationLink("https://evntly.au", "aicall-abc1234567")).toBe("https://evntly.au/become-a-vendor?src=direct_outreach&c=aicall-abc1234567");
  });
  it("webhook payload converts Retell units", () => {
    expect(payloadFor({ duration_ms: 125_400, call_cost: { combined_cost: 21.6 }, disconnection_reason: "user_hangup" })).toMatchObject({ duration_seconds: 125, cost_usd_cents: 22 });
  });
});

describe("runTool", () => {
  const call = { ref: "abcdefghij", providerCallId: "c1" };
  it("rejects unknown tools and bad args before the database", async () => {
    let called = 0;
    const rpc = async () => { called++; return { data: {}, error: null }; };
    expect((await runTool({ rpc, sendLink: async () => ({ ok: true }) }, call, "drop_tables", {})).status).toBe(400);
    const bad = await runTool({ rpc, sendLink: async () => ({ ok: true }) }, call, "send_registration_link", { channel: "email", consent_confirmed: true, consent_quote: "yes" });
    expect(bad.result.error).toMatch(/email is required/);
    expect(called).toBe(0);
  });
  it("sends the link only when the database says so, and never echoes the address", async () => {
    const sent: unknown[] = [];
    const rpc = async () => ({ data: { ok: true, send: { channel: "sms", to: "+61411222333", campaign: "aicall-abcdefghij" }, say: "Sent" }, error: null });
    const r = await runTool({ rpc, sendLink: async (x) => { sent.push(x); return { ok: true }; } }, call, "send_registration_link", { channel: "sms", consent_confirmed: true, consent_quote: "yes text me" });
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(r.result)).not.toContain("+61411222333");
  });
  it("a link that fails to send is un-recorded so a retry really sends", async () => {
    const calls: string[] = [];
    const rpc = async (_fn: string, a: Record<string, unknown>) => {
      calls.push(String(a.p_tool));
      return a.p_tool === "send_registration_link"
        ? { data: { ok: true, send: { channel: "sms", to: "+61411222333", campaign: "aicall-abcdefghij" } }, error: null }
        : { data: { ok: true }, error: null };
    };
    const r = await runTool({ rpc, sendLink: async () => ({ ok: false, error: "no sms" }) }, call, "send_registration_link", { channel: "sms", consent_confirmed: true, consent_quote: "yes text me" });
    expect(calls).toEqual(["send_registration_link", "link_send_failed"]);
    expect(r).toMatchObject({ ok: false, result: { error: expect.stringMatching(/text couldn't be sent.*email/) } });
    // The agent can't call the server-only action itself.
    expect((await runTool({ rpc, sendLink: async () => ({ ok: true }) }, call, "link_send_failed", {})).status).toBe(400);
  });
  it("database rule messages go back to the agent", async () => {
    const rpc = async () => ({ data: null, error: { message: "Ask for permission to send the link first." } });
    const r = await runTool({ rpc, sendLink: async () => ({ ok: true }) }, call, "send_registration_link", { channel: "sms", consent_confirmed: false, consent_quote: "hm" });
    expect(r).toMatchObject({ ok: false, result: { error: "Ask for permission to send the link first." } });
  });
});

describe("daily report", () => {
  it("adds phone agent lines only once it's been used", async () => {
    const { phoneAgentLines } = await import("@/lib/acquisition/report");
    expect(phoneAgentLines(null)).toEqual([]);
    expect(phoneAgentLines({ day: {}, total: { calls: 0 }, budgetCents: 5000 })).toEqual([]);
    const lines = phoneAgentLines({
      day: { calls: 3, connected: 2, interested: 1, links_sent: 1 },
      total: { calls: 8, pilot_calls: 5, registrations: 2, listings_completed: 1, cost_aud_cents: 640, reviewed_calls: 4, avg_quality_x10: 42, latency_p50_ms: 900 },
      budgetCents: 5000,
    }).join("\n");
    expect(lines).toMatch(/3 calls, 2 answered, 1 interested/);
    expect(lines).toMatch(/spend A\$6\.40 of A\$50\.00; cost per registration A\$3\.20, per completed listing A\$6\.40/);
    expect(lines).toMatch(/4\.2\/5 from 4 reviewed calls, median response 0\.9s/);
  });
});

describe("rule check details", () => {
  it("understands curly apostrophes in negations", () => {
    const t: TranscriptEntry[] = [
      { who: "agent", text: opening({ mode: "pilot", vendorName: "X", category: "dj" }) },
      { who: "vendor", text: "Will I get bookings?" },
      { who: "agent", text: "I understand; we can’t promise bookings yet since Evntly is new." },
      { who: "tool", name: "record_outcome", args: {}, ok: true, result: {} },
    ];
    expect(checkPolicy(t).failures).toEqual([]);
  });
});

describe("playground calls", () => {
  it("separate simulated conversations that all share call_id 'playground'", async () => {
    const { playgroundId } = await import("@/lib/phone-agent/server");
    const a = playgroundId("sim1", [{ content: "Hi, it's Evntly's AI assistant" }, { content: "Who's this?" }]);
    const a2 = playgroundId("sim1", [{ content: "Hi, it's Evntly's AI assistant" }, { content: "Who's this?" }, { content: "later turn" }]);
    const b = playgroundId("sim2", [{ content: "Hi, it's Evntly's AI assistant" }, { content: "Who's this?" }]);
    expect(a).toBe(a2);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^playground-[0-9a-f]{20}$/);
  });
});
