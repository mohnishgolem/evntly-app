import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information Evntly collects, how it's used, and your rights.",
  alternates: { canonical: "/privacy-policy" },
};

const strong = "text-foreground";
const link = "text-foreground underline underline-offset-2";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-1 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-sm text-muted-foreground">Last updated: 20 October 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">1. Who this applies to</h2>
          <p>
            This policy explains how{" "}
            <strong className={strong}>Sai Mohnish Golem (ABN 49 193 658 959), trading as Evntly</strong>{" "}
            (&quot;Evntly&quot;, &quot;we&quot;) collects, uses, shares and protects personal
            information when you use Evntly, whether you&apos;re browsing as a visitor, planning an
            event (a &quot;Customer&quot;), or listing a business (a &quot;Vendor&quot;). We handle
            personal information in line with the Australian Privacy Principles in the{" "}
            <em>Privacy Act 1988</em> (Cth).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">2. What we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className={strong}>Account information</strong>: your name, email address and
              phone number (if you give it), entered by you or supplied by Google when you sign in
              with Google. If you turn on two-factor authentication we store what&apos;s needed to
              check your codes, not the codes themselves.
            </li>
            <li>
              <strong className={strong}>Event details</strong>: event type, date, suburb, guest
              count, budget, notes and any costs you add to your event&apos;s budget tracker.
            </li>
            <li>
              <strong className={strong}>Vendor details</strong>: business name, bio, category,
              pricing, service area, suburb, availability, ABN and GST status (if you add them),
              and the photos and videos you upload to your portfolio.
            </li>
            <li>
              <strong className={strong}>Messages, files, quotes, bookings and reviews</strong>:
              what you send and receive through Evntly, including photo and PDF attachments.
            </li>
            <li>
              <strong className={strong}>Notification settings</strong>: if you turn on push
              notifications, the address your browser&apos;s push service gives us for your device.
            </li>
            <li>
              <strong className={strong}>Usage information</strong>: anonymous counts of visits to
              a few pages (home, Explore, vendor profiles, planning, vendor signup and bundles),
              tied to a random ID stored in your browser rather than to you. We don&apos;t count
              visits when your browser sends a Do Not Track or Global Privacy Control signal. We
              also use Vercel Analytics, which doesn&apos;t use cross-site tracking cookies.
            </li>
            <li>
              <strong className={strong}>Error reports</strong>: when something breaks, the page,
              your browser type and technical details of the error, so we can fix it.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">3. How we use it</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Run your account and let you plan events or list a business;</li>
            <li>Match Customers with Vendors and handle quotes, bookings and invoices;</li>
            <li>Deliver messages, and tell you about new activity by email and (if you turn it on) push notification, including reminders before a quote request expires;</li>
            <li>Show listings, portfolios, ratings and reviews;</li>
            <li>Keep Evntly safe and trustworthy (see section 4);</li>
            <li>Understand how Evntly is used and fix problems.</li>
          </ul>
          <p className="mt-2">We don&apos;t sell your personal information or use it for third-party advertising.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">4. Message and attachment screening</h2>
          <p>
            Until a Customer and Vendor have a booking, phone numbers, email addresses and social
            media handles in messages are hidden from both sides (they&apos;re shown once a booking
            exists). Email and push previews of messages always hide them. Photo and PDF
            attachments are checked automatically on our own servers, using text recognition for
            photos, and a file that contains contact details is held back from the other person
            until there&apos;s a booking. We also flag messages that mention paying outside
            Evntly.
          </p>
          <p className="mt-2">
            These checks are automated. When something is found, a short record (what was found
            and in which conversation) is kept for our safety review. We don&apos;t read your
            messages for any other purpose.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">5. What other people can see</h2>
          <p>
            A Vendor&apos;s listing is public: business name, bio, category, pricing, suburb (shown
            as an approximate area on the map, never an exact address), ABN if added, portfolio
            and reviews. When you message, request a quote or book, the other party sees what you
            send and your name as it appears on Evntly. Contact details are only revealed once there&apos;s a
            booking, as described above.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">6. Who we share it with</h2>
          <p>We share the minimum needed with service providers who run parts of Evntly for us:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong className={strong}>Supabase</strong>: database, sign-in and file storage (Sydney, Australia);</li>
            <li><strong className={strong}>Vercel</strong>: website hosting and analytics (our servers run in Sydney; Vercel&apos;s network operates globally);</li>
            <li><strong className={strong}>Resend</strong>: sending our emails (United States);</li>
            <li><strong className={strong}>Your browser&apos;s push service</strong> (for example Google, Apple, Mozilla or Microsoft): delivering push notifications, if you turn them on. Notification contents are encrypted in transit;</li>
            <li><strong className={strong}>Photon by Komoot</strong>: looking up suburbs when a Vendor sets their location (Germany);</li>
            <li><strong className={strong}>OpenFreeMap</strong>: map tiles your browser loads when you view the map (Europe);</li>
            <li><strong className={strong}>Unsplash</strong>: some images (including sample listing photos) are loaded from Unsplash by your browser;</li>
            <li><strong className={strong}>Google</strong>: if you choose to sign in with Google.</li>
          </ul>
          <p className="mt-2">
            We may also disclose information if the law requires it, or to protect the safety of
            our users.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">7. Overseas disclosure</h2>
          <p>
            Our database and files are stored in Sydney. Some of the providers above are based or
            process data overseas, mainly in the United States and Europe (Germany), as listed in
            section 6. We choose providers with established security practices and share only
            what each needs to do its job.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">8. Cookies and browser storage</h2>
          <p>
            We use cookies that are needed to keep you signed in. In your browser&apos;s local
            storage we keep your light/dark theme choice and the random ID used for the anonymous
            visit counts in section 2. We don&apos;t use advertising cookies.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">9. How long we keep it</h2>
          <p>
            We keep account, listing, message and booking information while your account is
            active, and for a reasonable period afterwards in case it&apos;s needed to resolve a
            dispute or meet a legal obligation. Error reports are deleted after 30 days, anonymous
            visit counts after about 13 months, and abuse-prevention counters after 2 days.
            Deleting a portfolio photo or video also deletes the file.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">10. Your choices and rights</h2>
          <p>
            You can update most of your details in your account and turn push notifications off
            at any time from your profile. You can ask to access, correct or delete the personal
            information we hold about you by emailing{" "}
            <a href="mailto:hello@evntlyapp.com" className={link}>hello@evntlyapp.com</a>. If
            you&apos;re unhappy with how we&apos;ve handled your information, contact us first; you
            can also complain to the Office of the Australian Information Commissioner (
            <a href="https://www.oaic.gov.au" className={link} target="_blank" rel="noreferrer">oaic.gov.au</a>).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">11. Children</h2>
          <p>Evntly is not intended for anyone under 18, and we don&apos;t knowingly collect information from children.</p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">12. Security</h2>
          <p>
            We use encryption in transit, access controls in our database so people only see their
            own information, rate limits against abuse, and two-factor authentication for admin
            access. No online service can guarantee absolute security, and we&apos;ll tell affected
            users and the regulator about a data breach where the law requires it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">13. Changes to this policy</h2>
          <p>
            We may update this policy as Evntly changes; the &quot;Last updated&quot; date above
            shows the current version.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">14. Contact</h2>
          <p>
            Questions about this policy or your information? Email{" "}
            <a href="mailto:hello@evntlyapp.com" className={link}>hello@evntlyapp.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
