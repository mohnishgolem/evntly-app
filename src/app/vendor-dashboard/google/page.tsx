import type { Metadata } from "next";
import Link from "next/link";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { googleBookingLink } from "@/lib/google-booking";
import { CopyLinkField } from "@/components/copy-link-field";

export const metadata: Metadata = {
  title: "Get bookings from Google",
  robots: { index: false, follow: false },
};

const STEPS = [
  <>
    Open your profile at{" "}
    <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" className="text-primary-text underline">
      business.google.com
    </a>
    , or search your business name on Google while signed in.
  </>,
  <>
    In Google Search, tap <strong>Booking</strong>. In Google Maps, tap <strong>Edit profile</strong>, then{" "}
    <strong>Booking</strong>.
  </>,
  <>
    Tap <strong>Add link</strong> (or <strong>Add another link</strong>), paste your Evntly link and tap{" "}
    <strong>Save</strong>.
  </>,
  <>
    Optional: if you have more than one booking link, choose <strong>Set preferred link</strong> and pick Evntly so it shows first.
  </>,
];

// The Fresha model: a vendor's own Google Business Profile gets a "Book"
// button that opens their Evntly listing with the booking form ready.
export default async function GoogleBookingPage() {
  await requireVendor("/vendor-dashboard/google");
  const supabase = await createClient();
  const { data: listings } = await supabase.rpc("my_service_providers").select("id, name, status");
  const approved = (listings ?? []).filter((l) => l.status === "approved");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Get bookings from Google</h1>
      <p className="mb-6 text-muted-foreground">
        Add your Evntly link to your Google Business Profile. Customers who find you on Google Search or Maps can tap{" "}
        <strong>Book</strong> and go straight to your Evntly listing to request a quote or book you.
      </p>

      {approved.length === 0 ? (
        <div className="surface-raised rounded-card p-5">
          <p className="font-semibold">Available once your listing is approved</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your booking link only works when customers can see your listing. We&apos;ll email you when it&apos;s approved.
          </p>
        </div>
      ) : (
        <section aria-labelledby="your-link" className="mb-8 surface-raised rounded-card p-5">
          <h2 id="your-link" className="mb-3 font-semibold">
            Your booking link
          </h2>
          <div className="space-y-4">
            {approved.map((l) => (
              <div key={l.id}>
                {approved.length > 1 && <p className="mb-1.5 text-sm font-medium">{l.name}</p>}
                <CopyLinkField id={`booking-link-${l.id}`} label={`Booking link for ${l.name}`} value={googleBookingLink(l.id)} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="how" className="mb-8">
        <h2 id="how" className="mb-3 text-lg font-semibold">
          Add it to Google in 2 minutes
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-[15px]">
          {STEPS.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">
          No Google Business Profile yet? Create one free at business.google.com. Google checks that your business is real
          before it goes live.
        </p>
      </section>

      <section aria-labelledby="also" className="rounded-2xl bg-muted/40 p-5">
        <h2 id="also" className="mb-2 font-semibold">
          Use the same link anywhere
        </h2>
        <p className="text-sm text-muted-foreground">
          Your Instagram bio, Facebook page or website &ldquo;Book now&rdquo; button work too. Customers send you a quote
          request through Evntly and you reply from{" "}
          <Link href="/vendor-dashboard/enquiries" className="text-primary-text underline">
            Enquiries
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
