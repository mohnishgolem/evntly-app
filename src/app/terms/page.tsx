import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms for using Evntly as a customer or vendor.",
  alternates: { canonical: "/terms" },
};

const strong = "text-foreground";
const link = "text-foreground underline underline-offset-2";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-1 text-2xl font-bold">Terms &amp; Conditions</h1>
      <p className="mb-8 text-sm text-muted-foreground">Last updated: 20 October 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Who we are</h2>
          <p>
            Evntly (&quot;Evntly&quot;, &quot;we&quot;, &quot;us&quot;) is operated by{" "}
            <strong className={strong}>Sai Mohnish Golem (ABN 49 193 658 959), trading as Evntly</strong>.
            Evntly is an online marketplace that connects people planning events
            (&quot;Customers&quot;) with independent businesses offering event services such as
            photographers, decorators, DJs and celebrants (&quot;Vendors&quot;), currently in the
            Sydney area. By creating an account or using Evntly, you agree to these Terms and our{" "}
            <Link href="/privacy-policy" className={link}>Privacy Policy</Link>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">2. What Evntly is, and isn&apos;t</h2>
          <p>
            Evntly is a place for Customers and Vendors to find each other, message, request quotes
            and arrange bookings. Evntly is not a party to the agreement a Customer and Vendor make
            with each other, does not employ Vendors, and does not guarantee the quality, safety,
            legality or availability of any Vendor&apos;s services. You choose and engage a Vendor
            at your own discretion.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">3. Sample listings</h2>
          <p>
            Some listings are marked <strong className={strong}>&quot;Sample listing&quot;</strong>.
            They show how Evntly works and are not real businesses: their photos are stock images
            and quote requests or messages sent to them won&apos;t be answered.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">4. Accounts</h2>
          <p>
            You need an account to message Vendors, request quotes, book, or list a business. You
            must be at least 18. You&apos;re responsible for keeping your login secure and for the
            accuracy of the information you give us.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">5. Vendor listings</h2>
          <p>
            Listings are reviewed before they appear in search, but approval is not an endorsement
            or a guarantee of quality. Vendors are responsible for the accuracy of their listing,
            including pricing, service area, availability, ABN and GST status, and for honouring
            the services and prices they advertise and quote. Vendors must own, or have permission
            to use, every photo and video they upload. A &quot;Founding vendor&quot; badge is given
            at Evntly&apos;s discretion and is not an endorsement. We may edit, hide or suspend a
            listing that is inaccurate or breaches these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">6. Quotes and bookings</h2>
          <p>
            Customers request quotes and Vendors set their own prices. A quote request expires if
            the Vendor doesn&apos;t reply within 7 days, and a quote expires if the Customer
            doesn&apos;t accept it within 7 days; we may send reminders before that happens.
            Accepting a quote creates a booking. The contract for the event services is between the
            Customer and the Vendor; Evntly provides the introduction and the booking record but is
            not responsible for a Vendor&apos;s performance, a cancellation, or a dispute between
            the parties.
          </p>
          <p className="mt-2">
            <strong className={strong}>Payments.</strong> Evntly does not currently process
            payments. Customers pay Vendors directly, outside Evntly, on terms they agree between
            themselves. If we introduce payments on Evntly, we&apos;ll update these Terms to explain
            how payments, refunds and cancellations work before they apply to you.
          </p>
          <p className="mt-2">
            <strong className={strong}>Invoices.</strong> Evntly can generate an invoice for a
            confirmed booking using the details the Vendor provides (such as their ABN and GST
            status). The invoice is issued by the Vendor, not by Evntly, and Vendors are responsible
            for their own tax obligations.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">7. Messaging and contact details</h2>
          <p>
            Until a Customer and Vendor have a booking, phone numbers, email addresses and social
            media handles in messages are hidden, and attachments that contain them are held back.
            They&apos;re revealed once a booking exists. Messages that mention paying outside Evntly
            may be flagged for review. These checks are automated; see our{" "}
            <Link href="/privacy-policy" className={link}>Privacy Policy</Link> for details. You
            can block someone at any time, which stops them messaging you or requesting quotes.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">8. Notifications</h2>
          <p>
            We send emails about activity on your account, such as new messages, quotes, bookings
            and reminders. If you turn on push notifications, we&apos;ll also send them to that
            device; you can turn them off from your profile.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">9. Reviews</h2>
          <p>
            Only a Customer who completed a booking with a Vendor can review them, and reviews must
            reflect a genuine experience. Ratings are calculated only from these reviews. We may
            remove a review that is fraudulent, abusive or breaches these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">10. Things you must not do</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Impersonate another person or business, or list services you don&apos;t provide;</li>
            <li>Post false, misleading or fraudulent listings, photos or reviews;</li>
            <li>Harass, threaten or abuse another user;</li>
            <li>Try to get around the contact-detail protections before a booking;</li>
            <li>Use Evntly for anything unlawful;</li>
            <li>Interfere with or try to compromise Evntly&apos;s security or operation.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">11. Your content</h2>
          <p>
            Evntly&apos;s branding, design and software belong to us or our licensors. Content you
            submit (listing details, photos, videos, messages, reviews) stays yours, but you give
            Evntly a non-exclusive licence to store and display it for the purpose of running and
            promoting the service.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">12. Liability</h2>
          <p>
            Evntly is provided &quot;as is&quot;. To the extent the law allows, Evntly is not liable
            for loss arising from a Vendor&apos;s services, a dispute between a Customer and a
            Vendor, or your use of Evntly. Nothing in these Terms excludes, restricts or modifies any
            right or remedy you have under the{" "}
            <strong className={strong}>Australian Consumer Law</strong> that cannot lawfully be
            excluded.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">13. Ending your account</h2>
          <p>
            You can stop using Evntly and ask us to close your account at any time. We may suspend
            or close an account that breaches these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">14. Changes to these Terms</h2>
          <p>
            We may update these Terms as Evntly changes. For significant changes we&apos;ll tell
            you by email or on the site before they take effect. Continuing to use Evntly after
            that means you accept the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">15. Governing law</h2>
          <p>
            These Terms are governed by the laws of{" "}
            <strong className={strong}>New South Wales, Australia</strong>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">16. Contact</h2>
          <p>
            Questions about these Terms? Email{" "}
            <a href="mailto:hello@evntlyapp.com" className={link}>hello@evntlyapp.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
