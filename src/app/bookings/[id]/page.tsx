import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, MapPin, MessageCircle, Receipt } from "lucide-react";
import { getAdminSession, getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOOKING_COLUMNS } from "@/lib/public-columns";
import { categoryLabel } from "@/lib/config";
import { formatEventDate } from "@/lib/email";
import { getPaymentsStatus } from "@/lib/payments/server";
import { BookingPayments, type PaymentMilestone } from "@/components/payments/booking-payments";
import { DirectPaymentNotice } from "@/components/payments/direct-payment-notice";
import { VendorBookingActions } from "@/components/vendor-booking-actions";
import { DisputePanel } from "@/components/dispute-panel";
import { loadBookingDisputes } from "@/lib/data/disputes";
import { sydneyDate } from "@/lib/event-dates";

export const metadata: Metadata = {
  title: "Booking",
  robots: { index: false, follow: false },
};

// One page for both parties to a booking: details, the payment plan and its
// milestones, and the payment history. Bookings and payment tables are RLS
// scoped to the two parties, so anyone else gets a 404.
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const { paid } = await searchParams;
  const session = await getCurrentUser();
  if (!session) redirect(`/login?next=/bookings/${encodeURIComponent(id)}`);

  const supabase = await createClient();
  const { data: booking } = await supabase.from("bookings").select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
  if (!booking) notFound();
  const partyRole =
    booking.provider_owner_user_id === session.user.id ? "vendor" : booking.client_user_id === session.user.id ? "customer" : null;
  // Admins (with their second factor) get a read-only view for support.
  const adminView = !partyRole && (await getAdminSession()).mfa === "ok";
  if (!partyRole && !adminView) notFound();
  const role = partyRole ?? "admin";

  const { data: plan } = await supabase
    .from("payment_plans")
    .select("id, plan_type, status, total_cents, commission_bps, change_note, vendor_user_id")
    .eq("booking_id", booking.id)
    .maybeSingle();

  const [{ data: milestoneRows }, { data: eventRows }, status] = await Promise.all([
    plan
      ? supabase.from("payment_milestones").select("*").eq("plan_id", plan.id).order("position")
      : Promise.resolve({ data: [] as never[] }),
    plan
      ? supabase
          .from("payment_events")
          .select("id, event, actor_role, created_at, milestone_id")
          .eq("plan_id", plan.id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as never[] }),
    getPaymentsStatus(),
  ]);

  // Evidence links: short-lived signed URLs (the bucket is private and
  // storage RLS only lets the two parties read this plan's folder).
  const allPaths = (milestoneRows ?? []).flatMap((m) => m.evidence_paths);
  const { data: signed } = allPaths.length
    ? await supabase.storage.from("milestone-evidence").createSignedUrls(allPaths, 60 * 30)
    : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const milestones: PaymentMilestone[] = (milestoneRows ?? []).map((m) => ({
    id: m.id,
    position: m.position,
    kind: m.kind,
    name: m.name,
    deliverables: m.deliverables,
    amount_cents: m.amount_cents,
    due_date: m.due_date,
    work_status: m.work_status,
    funding_status: m.funding_status,
    payout_status: m.payout_status,
    vendor_note: m.vendor_note,
    customer_note: m.customer_note,
    evidence: m.evidence_paths.map((p) => ({ path: p, url: urlFor.get(p) ?? null, name: p.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "") })),
  }));
  const nameById = new Map(milestones.map((m) => [m.id, m.name]));

  // Whether the vendor can receive payouts (customers can't read the
  // vendor's account row, so this one boolean comes from the server).
  let vendorReady = false;
  const admin = createAdminClient();
  if (admin) {
    const { data: acct } = await admin
      .from("stripe_accounts")
      .select("transfers_active")
      .eq("user_id", booking.provider_owner_user_id!)
      .maybeSingle();
    vendorReady = !!acct?.transfers_active;
  }

  const totalCents = Math.round(Number(booking.total_price ?? 0) * 100);
  const disputes = await loadBookingDisputes(booking.id, session.user.id);
  // Same window the open_booking_dispute RPC enforces.
  const canDispute = booking.status !== "declined" && booking.event_date >= sydneyDate(-90);
  const backHref = role === "vendor" ? "/vendor-dashboard/bookings" : role === "admin" ? "/admin/payments" : "/dashboard/bookings";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {role === "admin" ? "Payments" : "Bookings"}
      </Link>

      {paid && (
        <p role="status" className="mb-4 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
          Thanks — your payment is being confirmed. It&apos;ll show as paid here within a minute.
        </p>
      )}

      <header className="mb-6">
        <p className="text-sm text-muted-foreground">{categoryLabel(booking.service_type)}</p>
        <h1 className="text-2xl font-bold">
          {role === "vendor" ? booking.client_label ?? booking.client_name ?? "Customer" : booking.provider_name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-4" aria-hidden /> {formatEventDate(booking.event_date)}
            {booking.event_time ? ` · ${booking.event_time}` : ""}
          </span>
          {booking.event_address && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" aria-hidden /> {booking.event_address}
            </span>
          )}
          <span className="capitalize">Status: {booking.status}</span>
        </div>
        {role !== "admin" && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link
              href={role === "vendor" ? "/messages" : `/messages/${booking.provider_id}:${session.user.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 hover:bg-muted"
            >
              <MessageCircle className="size-4" aria-hidden /> Messages
            </Link>
            {(booking.status === "confirmed" || booking.status === "completed") && (
              <Link
                href={`/bookings/${booking.id}/invoice`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 hover:bg-muted"
              >
                <Receipt className="size-4" aria-hidden /> Invoice
              </Link>
            )}
          </div>
        )}
        {role === "vendor" && <VendorBookingActions bookingId={booking.id} status={booking.status} />}
      </header>

      <DisputePanel bookingId={booking.id} role={role} disputes={disputes} canOpen={canDispute} />

      {/* Online payments are switched off at launch: customers pay vendors
          directly. Only show Evntly's payment plans once payments are on
          (or for a plan made while they were on). */}
      {status.enabled || plan ? (
      <BookingPayments
        role={role}
        bookingId={booking.id}
        bookingStatus={booking.status}
        eventDate={booking.event_date}
        totalCents={totalCents}
        commissionBps={plan?.commission_bps ?? status.commissionBps}
        plan={plan}
        milestones={milestones}
        events={(eventRows ?? []).map((e) => ({
          id: e.id,
          event: e.event,
          actor_role: e.actor_role,
          created_at: e.created_at,
          milestone_name: e.milestone_id ? nameById.get(e.milestone_id) ?? null : null,
        }))}
        paymentsEnabled={status.enabled}
        vendorReady={vendorReady}
      />
      ) : (
        <DirectPaymentNotice role={role} />
      )}
    </div>
  );
}
