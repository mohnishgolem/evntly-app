import type { LegalDocument } from "@/lib/legal/types";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";

export const privacyPolicy: LegalDocument = {
  key: "privacy_policy",
  title: "Privacy Policy",
  path: "/privacy-policy",
  version: LEGAL_VERSIONS.privacy_policy,
  summary: "What personal information Evntly collects, why, who we share it with, and your choices and rights.",
  keyPoints: [
    "We collect what we need to run the marketplace: your account, events, listings, messages, quotes and bookings.",
    "Vendors see your name and request details. Phone numbers and email addresses are shared only once a booking exists.",
    "We don't sell your personal information or use it for third-party advertising.",
    "Some things are automated, like hiding contact details, scanning attachments, matching vendors to events and flagging safety risks. A person reviews safety flags before any action is taken on an account.",
    "Our database is hosted in Sydney. Some service providers process data overseas, mainly in the United States and Europe.",
    "We'll send marketing emails only if you opt in, and you can unsubscribe at any time.",
  ],
  sections: [
    {
      id: "who",
      title: "1. Who we are and what this covers",
      blocks: [
        "This policy explains how **Sai Mohnish Golem trading as Evntly (ABN 49 193 658 959)** (**Evntly**, **we**, **us**) handles personal information when you use evntlyapp.com, whether you're a visitor, a Customer planning an event or a Vendor listing a business.",
        "We handle personal information in accordance with the Australian Privacy Principles (**APPs**) in the *Privacy Act 1988* (Cth). [[TBC: confirm with solicitor whether Evntly is required to comply (small business exemption and its exceptions) or is choosing to comply / opting in.]]",
      ],
    },
    {
      id: "collect",
      title: "2. Personal information we collect",
      blocks: [
        "**From you, when you use Evntly:**",
        {
          list: [
            "**Account details:** name, email address, password (stored as a secure hash by our sign-in provider), account type, and phone number if you add one. If you sign in with Google, Google gives us your name, email address and profile picture.",
            "**Security details:** if you turn on two-factor authentication, the information needed to check your codes (not the codes themselves); records of failed or rapid sign-in attempts.",
            "**Event details:** event type, date and times, suburb or address, guest numbers, budget and budget categories, notes, shortlisted vendors and costs you add to the budget tracker.",
            "**Vendor details:** business name, description, category, prices and packages, service area and travel settings, suburb (used to place an approximate pin on the map), availability and calendar blocks, ABN and GST status, phone number, photos and videos of your work.",
            "**Messages and attachments:** messages you send and receive, and photo or PDF attachments.",
            "**Quotes, bookings, reviews, reports and disputes:** what you request, quote, accept, cancel, review, report or raise as a problem, and related messages.",
            "**Choices and consents:** which version of our legal documents you accepted and when, your marketing-email choice, notification preferences, blocked users and saved vendors.",
            "**Account deletion requests**, and any reason you give.",
          ],
        },
        "**Automatically, when you use Evntly:**",
        {
          list: [
            "**Page views:** visits to a few key pages (home, Explore, vendor profiles, planning, vendor signup and bundles), linked to a random ID stored in your browser and, if you're signed in, to your account. We use the signed-in link to show your \"recently viewed\" vendors and to exclude our own staff's visits from our statistics. We don't record these visits if your browser sends a Do Not Track or Global Privacy Control signal.",
            "**Website analytics** from Vercel Analytics, which counts visits without cross-site tracking cookies.",
            "**Error reports:** when something breaks, the page, your browser and device type, technical details of the error and, if you're signed in, your account ID.",
            "**Network information:** your IP address (and, for sign-in attempts, the email address entered) is used to limit abuse, for example too many sign-in attempts. These counters are kept for 2 days and aren't stored with your account.",
            "**Push notifications:** if you turn them on, the address your browser's push service provides for your device.",
          ],
        },
        "**From other people:** a Vendor may add details to a quote for you; a Customer may describe you in a review or report; and another user may send you messages.",
        "We don't ask for sensitive information (such as health information). Please don't include it in messages or event notes unless it's needed (for example dietary or accessibility requirements you want a Vendor to know about).",
      ],
    },
    {
      id: "use",
      title: "3. How we use it",
      blocks: [
        {
          list: [
            "to create and run your account and sign you in securely;",
            "to show listings, portfolios, ratings and reviews;",
            "to help you plan events and suggest Vendors that might suit them;",
            "to send quote requests, quotes, messages and booking details between Customers and Vendors, and generate booking invoices for Vendors;",
            "to send you service emails and push notifications about your account and activity (you can change which ones you get in your notification settings; some essential ones, such as booking emails, can't be turned off);",
            "to keep Evntly safe: hide contact details before a booking, scan attachments, detect scams and misuse, handle reports, disputes and suspensions, and keep audit records of staff actions;",
            "to understand how Evntly is used, fix problems and improve it;",
            "to send marketing emails, only if you've opted in;",
            "to meet legal obligations and enforce our Terms.",
          ],
        },
        "**We don't sell your personal information, and we don't use it for third-party advertising.**",
      ],
    },
    {
      id: "automated",
      title: "4. Automated processing and decisions",
      blocks: [
        "Some parts of Evntly use computer programs that work with personal information. **We don't currently use artificial intelligence or large language models** to make or inform decisions about you. Here is what is automated:",
        {
          list: [
            "**Contact-detail protection (fully automated):** before a booking, phone numbers, email addresses and social media handles are hidden in messages, and photo or PDF attachments are scanned with text recognition on our own servers and held back if they contain contact details. A short record of what was found and in which conversation is kept for safety review.",
            "**Payment-related flags (automated flag, human review):** messages that mention paying outside the usual process are flagged for review.",
            "**Vendor matching and suggestions (automated ranking):** when you plan an event, Evntly scores Vendors using your event's category, date, location, guest numbers and budget, together with each Vendor's service area, availability, prices, packages, ratings and responsiveness. The score decides which Vendors are suggested and in what order. You can still browse and contact any listed Vendor.",
            "**Vendor responsiveness (automated):** we calculate how often and how quickly each Vendor responds to quote requests, and use it in matching.",
            "**Quote expiry (fully automated):** quote requests and quotes expire automatically after 7 days without a response.",
            "**Risk signals (automated flag, human decision):** we automatically count signals that may indicate misuse, such as repeated attempts to share contact details, reports and blocks against an account, cancellations soon after quoting, disputes, unusually high numbers of requests, and the same ABN used by several accounts. These signals are only shown to our staff. **A person always reviews them before any action, such as suspension, is taken on an account.**",
          ],
        },
        "If you think an automated process has affected you unfairly, contact us at hello@evntlyapp.com and a person will review it.",
      ],
    },
    {
      id: "see",
      title: "5. What other users can see",
      blocks: [
        {
          list: [
            "**Vendor listings are public:** business name, description, category, prices, packages, approximate area on the map (never an exact address), ABN if added, portfolio, ratings and reviews.",
            "**When you request a quote or message a Vendor**, they see your name as it appears on Evntly and the details you send (such as event type, date, suburb, guest numbers and budget).",
            "**Once a booking exists**, both parties can see each other's email address and phone number (if provided), and the event address if one was given, so you can deliver the booking.",
            "**Reviews** are public and show the reviewer's name as it appears on their Evntly account.",
          ],
        },
        "Vendors who receive your information through Evntly are separate businesses. They must use it only to respond to you and provide the booked services (see the [Vendor Service Agreement](/vendor-agreement)), but they handle it under their own privacy practices.",
      ],
    },
    {
      id: "share",
      title: "6. Service providers we share information with",
      blocks: [
        "We use these providers to run parts of Evntly. They receive only the information they need to provide their service to us:",
        {
          list: [
            "**Supabase:** database, sign-in and file storage (hosted in Sydney, Australia).",
            "**Vercel:** website hosting and analytics (our servers run in Sydney; Vercel's content delivery network operates globally, and Vercel is based in the United States).",
            "**Resend:** sending emails (United States).",
            "**Google:** sign-in, if you choose \"Continue with Google\" (United States and other locations).",
            "**Your browser's push service** (for example Google, Apple, Mozilla or Microsoft): delivering push notifications if you turn them on. Notification content is encrypted in transit.",
            "**Photon by Komoot:** looking up suburbs when a Vendor sets their location (Germany).",
            "**OpenFreeMap:** map tiles your browser loads when you view the map (Europe).",
            "**Unsplash:** some images, including sample listing photos, are loaded from Unsplash by your browser (United States).",
          ],
        },
        "We may also disclose information if the law requires it, to a regulator or law enforcement agency where permitted, to protect someone's safety, or to a buyer of the Evntly business (who would have to handle it in line with this policy).",
      ],
    },
    {
      id: "overseas",
      title: "7. Overseas disclosure",
      blocks: [
        "Our database and stored files are hosted in Sydney. Some of the providers in section 6 are based in, or process information in, other countries, mainly the **United States** and countries in **Europe** (including Germany). We choose providers with established security practices and share only what each needs.",
      ],
    },
    {
      id: "cookies",
      title: "8. Cookies and browser storage",
      blocks: [
        "We use cookies that are strictly needed to keep you signed in and secure. In your browser's local storage we keep your light/dark theme choice and the random ID used for page-view counts. We don't use advertising or cross-site tracking cookies. If you block cookies, you won't be able to sign in.",
      ],
    },
    {
      id: "marketing",
      title: "9. Emails and marketing",
      blocks: [
        "We send **service emails** about your account and activity (for example new messages, quotes, bookings, reminders and security emails). These aren't marketing. You can choose which non-essential ones you get in your notification settings.",
        "We'll send **marketing emails** (news, tips and offers from Evntly) only if you've ticked the optional box at sign-up or turned them on in Settings. Every marketing email will identify Evntly and include a working unsubscribe link, and we'll action unsubscribe requests within 5 business days. You can also withdraw consent at any time in Settings. We don't share your details with others for their marketing.",
      ],
    },
    {
      id: "security",
      title: "10. How we protect it",
      blocks: [
        "We use encryption in transit (HTTPS), database access rules so each person can only see the information they are entitled to, private storage for message attachments, rate limits against abuse, two-factor authentication for staff admin access, and audit logs of staff actions. No online service can guarantee complete security.",
      ],
    },
    {
      id: "breach",
      title: "11. Data breaches",
      blocks: [
        "If we suspect a data breach, we will act quickly to contain it and assess whether it is likely to result in serious harm to anyone affected. Where the Notifiable Data Breaches scheme applies, we'll complete that assessment within 30 days and, for an eligible data breach, notify affected individuals and the Office of the Australian Information Commissioner (OAIC) as soon as practicable, including what happened and what you can do.",
      ],
    },
    {
      id: "retention",
      title: "12. How long we keep it",
      blocks: [
        "We keep personal information only for as long as we need it for the purposes in this policy or to meet legal obligations, then delete or de-identify it.",
        {
          list: [
            "**Error reports:** deleted after 30 days.",
            "**Page-view records:** deleted after about 13 months.",
            "**Abuse-prevention counters** (including IP-based rate limits): deleted after 2 days.",
            "**Portfolio photos and videos:** deleted from storage when you delete them.",
            "**Account, listing, event, message, quote and booking information:** kept while your account is open. After you close your account: [[TBC: retention periods to be confirmed, e.g. booking and transaction records 7 years; messages 2 years; everything else deleted within 30 days.]]",
            "**Records of the legal documents you accepted and your marketing choices:** kept after your account is closed, as evidence of what was agreed. [[TBC: retention period.]]",
            "**Safety records** (reports, disputes, risk reviews, suspension and staff audit records): [[TBC: retention period.]]",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "13. Access, correction and deletion",
      blocks: [
        "You can update most of your details in your account. You can ask us to give you access to, or correct, the personal information we hold about you by emailing hello@evntlyapp.com. We'll respond within 30 days. We may need to verify your identity first, and may refuse access in limited cases the law allows (we'll tell you why).",
        "You can ask us to delete your account from **Settings → Privacy & legal → Delete account** or by email. Section 12 explains what we keep after deletion and why.",
      ],
    },
    {
      id: "complaints",
      title: "14. Privacy complaints",
      blocks: [
        "If you have a concern about how we've handled your personal information, email hello@evntlyapp.com with details. We'll acknowledge it within 3 business days and aim to respond within 30 days. If you're not satisfied with our response, you can complain to the Office of the Australian Information Commissioner at oaic.gov.au or on 1300 363 992.",
      ],
    },
    {
      id: "children",
      title: "15. Children",
      blocks: ["Evntly is not intended for anyone under 18, and we don't knowingly collect personal information from children."],
    },
    {
      id: "changes",
      title: "16. Changes to this policy",
      blocks: [
        "We'll update this policy when our practices change. The version date at the top shows the current version. For significant changes we'll also tell you by email or on Evntly.",
      ],
    },
    {
      id: "contact",
      title: "17. Contact",
      blocks: ["Privacy questions and requests: hello@evntlyapp.com. Sai Mohnish Golem trading as Evntly (ABN 49 193 658 959), Sydney NSW, Australia."],
    },
  ],
};
