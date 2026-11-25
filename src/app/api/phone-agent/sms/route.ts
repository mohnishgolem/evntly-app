import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { phoneAgentConfig } from "@/lib/phone-agent/config";
import { toE164 } from "@/lib/phone-agent/phone";
import { agentRpc } from "@/lib/phone-agent/server";
import { STOP_WORDS, twilioSignature } from "@/lib/phone-agent/webhooks";

// Inbound SMS to our number (Twilio messaging webhook). A STOP-type reply
// puts the number on the permanent suppression list straight away (Spam Act:
// unsubscribe must work; we action it immediately). Signed with Twilio's
// X-Twilio-Signature: base64 HMAC-SHA1 over the full URL + sorted form fields.

export async function POST(request: NextRequest) {
  const cfg = phoneAgentConfig();
  if (!cfg.twilio) return new NextResponse("Not configured", { status: 503 });

  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });
  const given = Buffer.from(request.headers.get("x-twilio-signature") ?? "");
  const expected = Buffer.from(twilioSignature(cfg.twilio.token, request.url, params));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const from = toE164(params.From);
  const body = params.Body ?? "";
  if (from && STOP_WORDS.test(body)) {
    const rpc = agentRpc();
    if (!rpc) return new NextResponse("Not configured", { status: 503 });
    const { error } = await rpc("phone_agent_sms_stop", { p_phone: from, p_body: body.slice(0, 40) });
    if (error) return new NextResponse("Failed", { status: 500 });
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Evntly: you're unsubscribed and won't hear from us again.</Message></Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }
  // Anything else: no auto-reply; Sai sees it in Twilio.
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, { headers: { "Content-Type": "text/xml" } });
}
