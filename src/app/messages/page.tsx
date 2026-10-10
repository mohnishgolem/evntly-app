import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { counterpartDisplayName } from "@/lib/messages";
import { maskContactInfo } from "@/lib/contact-reveal";
import type { Database } from "@/lib/supabase/database.types";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export default async function MessagesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/messages");

  const email = session.user.email as string;
  const supabase = await createClient();
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_email.eq.${email},recipient_email.eq.${email}`)
    .order("created_at", { ascending: false });

  const threads = new Map<string, MessageRow>();
  for (const m of messages ?? []) {
    if (!threads.has(m.conversation_id)) threads.set(m.conversation_id, m);
  }

  const providerIds = [
    ...new Set(
      [...threads.values()].map((m) => m.provider_id).filter((id): id is string => !!id)
    ),
  ];
  const providers = new Map<string, { name: string; owner_email: string | null }>();
  if (providerIds.length > 0) {
    const { data } = await supabase
      .from("service_providers")
      .select("id, name, owner_email")
      .in("id", providerIds);
    for (const p of data ?? []) providers.set(p.id, p);
  }

  // Same masking rule as the thread page: contact info in the preview stays
  // hidden until this vendor/customer pair has a real booking.
  const bookedPairs = new Set<string>();
  if (providerIds.length > 0) {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("provider_id, client_email")
      .in("provider_id", providerIds)
      .neq("status", "cancelled");
    for (const b of bookings ?? []) bookedPairs.add(`${b.provider_id}:${b.client_email}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Messages</h1>
      {threads.size === 0 ? (
        <p className="text-sm text-muted-foreground">No conversations yet.</p>
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border">
          {[...threads.values()].map((m) => {
            const counterpart = m.sender_email === email ? m.recipient_email : m.sender_email;
            const provider = m.provider_id ? (providers.get(m.provider_id) ?? null) : null;
            const displayName = counterpartDisplayName(counterpart, provider);
            const customerEmail = counterpart === provider?.owner_email ? email : counterpart;
            const booked =
              !!m.provider_id && bookedPairs.has(`${m.provider_id}:${customerEmail}`);
            const preview = booked ? m.content : maskContactInfo(m.content);
            return (
              <Link
                key={m.conversation_id}
                href={`/messages/${encodeURIComponent(m.conversation_id)}`}
                className="block px-4 py-3 transition-colors hover:bg-muted"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{displayName}</span>
                  {!m.read && m.recipient_email === email && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{preview}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
