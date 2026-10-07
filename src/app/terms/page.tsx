export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <p className="font-semibold text-warning">Draft — not legal advice</p>
        <p className="mt-1 text-muted-foreground">
          This is a working draft written to match how Evntly actually operates today. It has not
          been reviewed by a lawyer and should not be relied on as your final terms until it has
          been.
        </p>
      </div>

      <h1 className="mb-1 text-2xl font-bold">Terms &amp; Conditions</h1>
      <p className="mb-8 text-sm text-muted-foreground">Last updated: 7 October 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Who we are</h2>
          <p>
            Evntly (&quot;Evntly&quot;, &quot;we&quot;, &quot;us&quot;) is operated by{" "}
            <strong className="text-foreground">Sai Mohnish Golem (ABN 49 193 658 959), trading as Evntly</strong>.
            Evntly is an online marketplace that connects people planning events (&quot;Customers&quot;)
            with independent businesses offering event services such as DJs, photographers, florists
            and caterers (&quot;Vendors&quot;), currently serving the Sydney area. By creating an
            account or using Evntly, you agree to these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">2. What Evntly is — and isn&apos;t</h2>
          <p>
            Evntly is a venue for Customers and Vendors to find each other, communicate, request
            quotes, and arrange bookings. Evntly is not a party to the agreement a Customer and
            Vendor reach with each other, does not employ Vendors, and does not guarantee the
            quality, safety, legality, or availability of any Vendor&apos;s services. You engage a
            Vendor at your own discretion.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">3. Accounts</h2>
          <p>
            You need an account to message Vendors, request quotes, or list a business. You&apos;re
            responsible for keeping your login secure and for the accuracy of the information you
            provide — your name, contact details, and (for Vendors) your business details, pricing
            and service area. You must be at least 18 years old to create an account.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">4. Vendor listings</h2>
          <p>
            Vendor listings are reviewed by Evntly before they go live in search, but approval is
            not an endorsement or a guarantee of quality. Vendors are responsible for the accuracy
            of their own listing — pricing, service area, categories and availability — and for
            honouring the services and prices they advertise and quote. Evntly may remove or
            suspend a listing at its discretion, including for inaccurate information or breach of
            these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">5. Quotes and bookings</h2>
          <p>
            Customers can request a quote from a Vendor; the Vendor sets their own price. Accepting
            a quote creates a booking between the Customer and the Vendor. The contract for the
            event services themselves is between the Customer and the Vendor directly — Evntly
            facilitates the introduction and the booking record, but is not responsible for a
            Vendor&apos;s performance, cancellation, or any dispute between the parties.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Payments.</strong> Evntly does not currently
            process payments on the platform. Any payment for a Vendor&apos;s services is arranged
            and paid for directly between the Customer and the Vendor, outside Evntly, on whatever
            terms they agree. This may change in the future, in which case these Terms will be
            updated to describe how payments, refunds and cancellations are handled on-platform.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">6. Messaging and staying on-platform</h2>
          <p>
            Evntly provides messaging so Customers and Vendors can discuss an event before and
            after booking. To keep communication trustworthy and keep a record either party can
            rely on, message content may be automatically screened for shared contact details
            (such as phone numbers, emails or social media handles); matches may be redacted
            before the message is delivered. Please see our Privacy Policy for more detail.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">7. Reviews</h2>
          <p>
            Reviews may only be left by a Customer who completed a booking with that Vendor, and
            must reflect a genuine experience. Evntly may remove a review that is fraudulent,
            abusive, or breaches these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">8. Prohibited conduct</h2>
          <p>You agree not to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Impersonate another person or business, or list services you don&apos;t provide;</li>
            <li>Post false, misleading, or fraudulent reviews or listings;</li>
            <li>Harass, threaten, or abuse another user;</li>
            <li>Use Evntly for any unlawful purpose;</li>
            <li>Attempt to interfere with or compromise the platform&apos;s security or operation.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">9. Intellectual property</h2>
          <p>
            Evntly&apos;s branding, design and software are owned by us or our licensors. Content
            you submit (listing details, messages, reviews, photos) remains yours, but you grant
            Evntly a licence to display it on the platform for the purpose of operating the
            service.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">10. Disclaimers and liability</h2>
          <p>
            Evntly is provided &quot;as is&quot;. To the maximum extent permitted by law, Evntly
            disclaims liability for any loss arising from a Vendor&apos;s services, a dispute
            between a Customer and a Vendor, or from your use of the platform. Nothing in these
            Terms excludes a right or remedy you have under the{" "}
            <strong className="text-foreground">Australian Consumer Law</strong> that cannot be
            excluded.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">11. Termination</h2>
          <p>
            You may stop using Evntly and close your account at any time. We may suspend or
            terminate an account that breaches these Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">12. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Continuing to use Evntly after a change
            means you accept the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">13. Governing law</h2>
          <p>
            These Terms are governed by the laws of{" "}
            <strong className="text-foreground">New South Wales, Australia</strong>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">14. Contact</h2>
          <p>
            Questions about these Terms? Email us at{" "}
            <a href="mailto:hello@evntlyapp.com" className="text-foreground underline underline-offset-2">
              hello@evntlyapp.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
