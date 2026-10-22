import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBookingDisputes } from "@/lib/data/disputes";
import { AdminMfaRequired } from "@/components/admin-mfa-required";
import { AdminDisputeControls } from "@/components/admin-dispute-controls";
import { DisputePanel } from "@/components/dispute-panel";
import { BOOKING_COLUMNS } from "@/lib/public-columns";
import { categoryLabel } from "@/lib/config";
import { formatEventDate } from "@/lib/email";
import { DISPUTE_STATUS_LABEL, reasonLabel, type DisputeStatus } from "@/lib/disputes";

export const metadata: Metadata = {
  title: "Dispute",
  robots: { index: false, follow: false },
};

export default async function AdminDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, needsEnrol } = await requireAdminPage(`/admin/disputes/${id}`);
  if (needsEnrol) return <AdminMfaRequired />;

  const supabase = await createClient();
  const { data: d } = await supabase
    .from("booking_disputes")
    .select("id, booking_id, reason, status, customer_user_id, vendor_user_id, opened_by_role")
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();

  const [{ data: booking }, { count: plans }, threads] = await Promise.all([
    supabase.from("bookings").select(BOOKING_COLUMNS).eq("id", d.booking_id).maybeSingle(),
    supabase.from("payment_plans").select("id", { count: "exact", head: true }).eq("booking_id", d.booking_id),
    loadBookingDisputes(d.booking_id, session.user.id),
  ]);
  const thisOne = threads.filter((t) => t.id === d.id);

  // Contact details for the admin only (service role; never shown to parties).
  const admin = createAdminClient();
  const email = async (uid: string | null) => (uid && admin ? (await admin.auth.admin.getUserById(uid)).data.user?.email ?? "—" : "—");
  const [customerEmail, vendorEmail] = await Promise.all([email(d.customer_user_id), email(d.vendor_user_id)]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/admin/disputes" className="mb-3 -ml-1 inline-flex h-11 items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Disputes
      </Link>
      <h1 className="text-2xl font-bold">{reasonLabel(d.reason)}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{DISPUTE_STATUS_LABEL[d.status as DisputeStatus]} · raised by the {d.opened_by_role}</p>

      {booking && (
        <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl border border-border p-4 text-sm">
          <dt className="text-muted-foreground">Booking</dt>
          <dd>
            <Link href={`/bookings/${booking.id}`} className="underline underline-offset-2">
              {booking.provider_name} · {categoryLabel(booking.service_type)}
            </Link>
          </dd>
          <dt className="text-muted-foreground">Event</dt>
          <dd>{formatEventDate(booking.event_date)}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="capitalize">{booking.status}{booking.total_price != null ? ` · $${Number(booking.total_price).toLocaleString("en-AU")}` : ""}</dd>
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="break-all">{customerEmail}</dd>
          <dt className="text-muted-foreground">Vendor</dt>
          <dd className="break-all">{vendorEmail}</dd>
          {!!plans && (
            <>
              <dt className="text-muted-foreground">Payments</dt>
              <dd>
                <Link href="/admin/payments" className="underline underline-offset-2">
                  Refunds and holds are on the Payments page
                </Link>
              </dd>
            </>
          )}
        </dl>
      )}

      <DisputePanel bookingId={d.booking_id} role="admin" disputes={thisOne} canOpen={false} />
      <AdminDisputeControls disputeId={d.id} status={d.status as DisputeStatus} />
    </div>
  );
}
