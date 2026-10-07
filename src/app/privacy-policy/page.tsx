export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <p className="font-semibold text-warning">Draft — not legal advice</p>
        <p className="mt-1 text-muted-foreground">
          This is a working draft written to match the data Evntly actually collects and how it&apos;s
          actually used today. It has not been reviewed by a lawyer and should not be relied on as
          your final policy until it has been. One bracketed item in section 6 still needs a call
          on cross-border transfer disclosure before publishing.
        </p>
      </div>

      <h1 className="mb-1 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-sm text-muted-foreground">Last updated: 7 October 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Who this applies to</h2>
          <p>
            This policy explains how{" "}
            <strong className="text-foreground">Sai Mohnish Golem (ABN 49 193 658 959), trading as Evntly</strong>{" "}
            (&quot;Evntly&quot;, &quot;we&quot;) collects, uses and protects personal information when
            you use evntlyapp.com, whether you&apos;re browsing as a visitor, planning an event, or
            listing a business.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">2. What we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Account information</strong> — name, email, and
              phone number (if you provide it), either entered directly or supplied by Google/Apple
              when you sign in with those providers.
            </li>
            <li>
              <strong className="text-foreground">Event details</strong> — event type, date,
              location, guest count and budget, if you use the planning flow or request a quote.
            </li>
            <li>
              <strong className="text-foreground">Vendor listing details</strong> — business name,
              bio, pricing, categories, service area and portfolio photos, if you list a business.
            </li>
            <li>
              <strong className="text-foreground">Messages, quotes, bookings and reviews</strong> —
              the content you send and receive through the platform.
            </li>
            <li>
              <strong className="text-foreground">Usage data</strong> — basic, privacy-preserving
              analytics about how the site is used (via Vercel Analytics), which does not use
              cross-site tracking cookies.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">3. How we use it</h2>
          <p>We use your information to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Operate your account and let you plan events or list a business;</li>
            <li>Match Customers with relevant Vendors and enable quotes and bookings;</li>
            <li>Deliver messages between Customers and Vendors;</li>
            <li>Show reviews and ratings on vendor listings;</li>
            <li>Keep the platform safe — see the message-screening note below;</li>
            <li>Understand how the site is used, so we can improve it.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">4. Message screening</h2>
          <p>
            To help keep communication trustworthy and verifiable, messages sent through Evntly may
            be automatically scanned for shared contact details (phone numbers, emails, social
            media handles). Matches may be redacted before the message is delivered, and a record
            of what was caught may be kept for safety review. This is an automated process; we
            don&apos;t read your messages for any other purpose.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">5. Who we share it with</h2>
          <p>
            We share the minimum necessary with:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              The other party to a conversation, quote or booking (e.g. a Vendor sees the event
              details a Customer includes in a quote request);
            </li>
            <li>
              Our service providers, who process data on our behalf to run Evntly — currently{" "}
              <strong className="text-foreground">Supabase</strong> (database, authentication) and{" "}
              <strong className="text-foreground">Vercel</strong> (hosting, analytics);
            </li>
            <li>
              Google or Apple, if you choose to sign in with one of those providers;
            </li>
            <li>Law enforcement or regulators, if we&apos;re legally required to.</li>
          </ul>
          <p className="mt-2">We don&apos;t sell your personal information.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">6. Where it&apos;s stored</h2>
          <p>
            Our database is hosted by Supabase in the Sydney (ap-southeast-2) region. Vercel, our
            hosting and analytics provider, may serve and process some data from outside Australia
            as part of its global infrastructure.{" "}
            <strong className="text-foreground">
              [Confirm whether this needs a formal cross-border transfer disclosure.]
            </strong>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">7. How long we keep it</h2>
          <p>
            We keep account and booking information for as long as your account is active, and for
            a reasonable period after in case it&apos;s needed to resolve a dispute or meet a legal
            obligation. You can ask us to delete your account at any time — see below.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">8. Your rights</h2>
          <p>
            You can ask to access, correct, or delete the personal information we hold about you by
            emailing{" "}
            <a href="mailto:hello@evntlyapp.com" className="text-foreground underline underline-offset-2">
              hello@evntlyapp.com
            </a>
            . You can also update most of your details directly from your account settings.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">9. Children</h2>
          <p>Evntly is not intended for anyone under 18, and we don&apos;t knowingly collect data from children.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">10. Security</h2>
          <p>
            We rely on industry-standard security practices from our infrastructure providers
            (encryption in transit, access controls) to protect your information, but no online
            service can guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">11. Changes to this policy</h2>
          <p>We may update this policy from time to time; the &quot;Last updated&quot; date above will reflect the latest version.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">12. Contact</h2>
          <p>
            Questions about this policy or your data? Email{" "}
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
