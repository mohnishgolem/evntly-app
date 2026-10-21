import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { DashboardNav } from "@/components/dashboard-nav";
import { AppSidebar, SidebarFrame } from "@/components/site/app-sidebar";
import { CUSTOMER_DASHBOARD_TABS, VENDOR_ENQUIRY_TABS, VENDOR_NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { maskContactInfo } from "@/lib/contact-reveal";
import { attachmentLabel } from "@/lib/attachments";
import { PushToggle } from "@/components/push-toggle";
import { getVapidPublicKey } from "@/lib/push";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/messages");

  const supabase = await createClient();
  // One row per conversation, newest first, with the counterpart already
  // reduced to a display name — users can't read each other's emails.
  const [{ data: threads }, pushPublicKey, unread] = await Promise.all([
    supabase.rpc("my_conversations"),
    getVapidPublicKey(),
    getUnreadMessageCount(),
  ]);
  // Vendors reach messages through Enquiries; customers through their
  // dashboard — keep that section's tabs (and the vendor sidebar) here.
  const isVendor = session.profile?.role === "vendor";

  return (
    <SidebarFrame
      sidebar={isVendor ? <AppSidebar title="Your business" items={VENDOR_NAV} unread={unread} /> : null}
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Messages</h1>
        <DashboardNav items={isVendor ? VENDOR_ENQUIRY_TABS : CUSTOMER_DASHBOARD_TABS} />
        <PushToggle publicKey={pushPublicKey} compact />
        {!threads || threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {threads.map((t) => {
              // Same masking rule as the thread page: contact info in the
              // preview stays hidden until this vendor/customer pair has a
              // real booking.
              const preview = !t.last_content
                ? attachmentLabel(t.last_attachment_type)
                : t.booked
                  ? t.last_content
                  : maskContactInfo(t.last_content);
              return (
                <Link
                  key={t.conversation_id}
                  href={`/messages/${encodeURIComponent(t.conversation_id)}`}
                  className="block px-4 py-3 transition-colors hover:bg-muted"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t.counterpart_name}</span>
                    {t.unread_count > 0 && (
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
    </SidebarFrame>
  );
}
