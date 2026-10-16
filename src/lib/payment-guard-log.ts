import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { scanForPaymentCircumvention, PAYMENT_GUARD_ERROR } from "@/lib/payment-guard";

// Whether payment talk is blocked or only flagged is decided in ONE place:
// the enforce_payment_guard DB trigger, driven by
// app_settings.payment_guard_mode ('log' until in-app payments launch).
// In 'log' mode the trigger delivers the message and writes the Leak Log
// entry itself. In 'block' mode it rejects the insert with check_violation;
// the rejected transaction can't keep a log row, so the app records the
// blocked attempt here and shows the sender the guard message.

type Supabase = Awaited<ReturnType<typeof createClient>>;

const CHECK_VIOLATION = "23514";

export function isPaymentGuardRejection(error: { code?: string; message?: string } | null) {
  return !!error && error.code === CHECK_VIOLATION && /paying outside Evntly/.test(error.message ?? "");
}

/** Records a blocked attempt and returns the error to show the sender. */
export async function recordBlockedPayment(
  supabase: Supabase,
  sender: { id: string; email: string },
  conversationId: string,
  content: string
) {
  const guard = scanForPaymentCircumvention(content);
  await supabase.from("leakage_events").insert({
    sender_id: sender.id,
    sender_email: sender.email,
    conversation_id: conversationId,
    category: guard.blocked ? guard.category : "other",
    original_snippet: guard.blocked ? guard.snippet : null,
    redacted_message: null,
    delivered: false,
  });
  return { error: PAYMENT_GUARD_ERROR };
}
