import type { LegalDocument } from "@/lib/legal/types";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";

export const cancellationPolicy: LegalDocument = {
  key: "cancellation_policy",
  title: "Cancellation, Refund & Dispute Policy",
  path: "/cancellation-refund-dispute-policy",
  version: LEGAL_VERSIONS.cancellation_policy,
  summary:
    "How cancellations, deposits, refunds and problems with a booking work on Evntly, and what Evntly can and can't do to help.",
  keyPoints: [
    "Your booking is a contract between you and the vendor. The vendor's cancellation terms, as set out in their quote, apply.",
    "Those terms can't take away your rights under the Australian Consumer Law.",
    "You pay vendors directly, so refunds come from the vendor. Evntly can't reverse a payment or guarantee a refund.",
    "If something goes wrong, raise it on the booking page within 90 days of the event. Evntly will help both sides work it out.",
    "You can always go to NSW Fair Trading, NCAT or your card provider.",
  ],
  sections: [
    {
      id: "scope",
      title: "1. How this policy works",
      blocks: [
        "This policy forms part of Evntly's [Terms & Conditions](/terms) and [Vendor Service Agreement](/vendor-agreement). It is published by **Sai Mohnish Golem trading as Evntly (ABN 49 193 658 959)**.",
        "When a Customer accepts a Vendor's quote on Evntly, they make a contract **directly with the Vendor**. Evntly is not a party to that contract and, while online payments are switched off, doesn't receive or hold any booking payment. So this policy explains:",
        {
          list: [
            "what Vendors must tell Customers about cancellations, deposits and refunds;",
            "the rights Customers have under the Australian Consumer Law (**ACL**), whatever a Vendor's terms say; and",
            "how Evntly's process for raising and resolving problems works, and its limits.",
          ],
        },
      ],
    },
    {
      id: "vendor-terms",
      title: "2. Vendors' cancellation terms",
      blocks: [
        "Each Vendor sets their own cancellation, rescheduling and deposit terms. Vendors should include them in their quote (the quote form has a \"Cancellation\" field), and Customers should read them before accepting. If a quote doesn't include cancellation terms, ask the Vendor in Messages before you accept.",
        "A Vendor's terms must be clear, fair and lawful. They can't exclude or limit the consumer guarantees, and terms in standard-form contracts that are unfair (for example, letting only one side cancel, or imposing a penalty out of proportion to the Vendor's actual loss) may be void under the ACL.",
      ],
    },
    {
      id: "customer-cancels",
      title: "3. If you (the Customer) cancel",
      blocks: [
        "Tell the Vendor as early as possible, using **Cancel booking** on the booking (which notifies them) or Messages, so there's a record.",
        "Whether you get any money back depends on the Vendor's cancellation terms you agreed to and on the law. Commonly, the closer to the event you cancel, the more of the price the Vendor may keep to cover work already done and bookings they turned down. If you cancel because the Vendor has failed to meet a consumer guarantee, see section 7.",
      ],
    },
    {
      id: "vendor-cancels",
      title: "4. If the Vendor cancels",
      blocks: [
        "Vendors must tell the Customer as soon as possible if they can't provide a booked service, and cancel the booking on Evntly.",
        "If a Vendor cancels or can't deliver, the Customer is generally entitled to a refund of money paid for services that won't be provided, and may be entitled to other remedies under the contract and the ACL. The refund must come from the Vendor. Evntly may suggest other Vendors for your event, but can't guarantee a replacement.",
        "Evntly may take action against Vendors who cancel bookings without good reason, including suspension under the Vendor Service Agreement.",
      ],
    },
    {
      id: "deposits",
      title: "5. Deposits",
      blocks: [
        "A Vendor may ask for a deposit to secure a date. The quote should say how much it is, when it's due, and whether and when it is refundable.",
        "A deposit that is stated to be non-refundable should be reasonable: it should reflect a genuine estimate of what the Vendor loses if the booking is cancelled (for example turning away other work). A deposit doesn't stop a Customer getting a refund if the Vendor cancels or fails to meet a consumer guarantee.",
        "Deposits are paid directly to the Vendor. Evntly doesn't hold deposits.",
      ],
    },
    {
      id: "rescheduling",
      title: "6. Rescheduling and no-shows",
      blocks: [
        "**Rescheduling** needs both parties to agree. If the Vendor can't do the new date, the Vendor's cancellation terms apply unless you agree otherwise. Record any agreed change in Evntly Messages.",
        "**If the Customer doesn't show up or isn't ready** (for example the venue isn't available at the agreed time), the Vendor's cancellation terms generally apply, as if the Customer had cancelled on the day.",
        "**If the Vendor doesn't show up**, or arrives so late that the service can't reasonably be delivered, that is likely to be a major failure to supply the services. The Customer is entitled to a refund from the Vendor and may be entitled to compensation for reasonably foreseeable loss.",
      ],
    },
    {
      id: "acl",
      title: "7. When services aren't delivered properly: your ACL rights",
      blocks: [
        "Under the ACL, services must be provided with due care and skill, be fit for any purpose you made known to the Vendor, and be delivered within a reasonable time if no time was agreed. These guarantees apply whatever the Vendor's terms say.",
        {
          list: [
            "**Major failure** (for example the service was not provided, was substantially different from what was agreed, or is unsafe): you can cancel and get a refund for any unused portion, or keep the contract and get compensation for the drop in value.",
            "**Minor failure:** the Vendor can choose to fix the problem within a reasonable time. If they refuse or take too long, you can get someone else to do it and recover reasonable costs, or cancel and get a refund.",
            "You may also be entitled to compensation for other reasonably foreseeable loss or damage caused by the failure.",
          ],
        },
        "These remedies are against the **Vendor**, who supplied the services. For more information see the ACCC (accc.gov.au) and NSW Fair Trading (fairtrading.nsw.gov.au).",
      ],
    },
    {
      id: "raise",
      title: "8. Raising a problem through Evntly",
      blocks: [
        "1. **Talk to the other party first.** Many problems are fixed quickly by messaging the Vendor or Customer through Evntly.",
        "2. **Raise a problem on the booking.** If that doesn't work, open the booking and choose **Problems with this booking**. You can do this up to 90 days after the event date. Pick what went wrong, describe what happened and what would put it right. The other party is notified and can reply.",
        "3. **Provide evidence.** Include dates, what was agreed (quote, messages), what was delivered, and photos or documents where relevant. Messages and quotes sent through Evntly are already on record. If you need to share files, email them to hello@evntlyapp.com quoting the booking. Don't share other people's personal information unless you need to.",
        "4. **The other party responds.** Vendors are expected to respond within 5 business days. [[TBC: confirm.]]",
        "5. **Evntly reviews.** We aim to respond within 3 business days of a problem being raised. We may ask either party for more information, suggest a fair outcome, and record what was agreed. Either party can withdraw a problem once it's sorted.",
      ],
    },
    {
      id: "limits",
      title: "9. What Evntly can and can't do",
      blocks: [
        "Evntly **can**:",
        {
          list: [
            "help both parties communicate and try to reach an agreed outcome;",
            "record the outcome on the booking;",
            "remove reviews or content that breach our Terms;",
            "warn, restrict or suspend accounts that breach our Terms or the Vendor Service Agreement; and",
            "give information to regulators or law enforcement where the law allows.",
          ],
        },
        "Evntly **can't**:",
        {
          list: [
            "reverse, refund or recover payments made directly to a Vendor;",
            "guarantee that a Vendor or Customer will pay, refund or deliver anything;",
            "make a binding decision about your legal rights (only a court or tribunal can do that); or",
            "give you legal advice.",
          ],
        },
        "Using Evntly's process doesn't stop you taking any other step below at any time.",
      ],
    },
    {
      id: "external",
      title: "10. Outside help",
      blocks: [
        {
          list: [
            "**NSW Fair Trading** (fairtrading.nsw.gov.au, 13 32 20) can help with consumer complaints and may contact the business for you. If you live in another state or territory, contact its consumer protection agency.",
            "**NSW Civil and Administrative Tribunal (NCAT)** (ncat.nsw.gov.au) hears consumer claims, usually after a Fair Trading complaint.",
            "**Your bank or card provider** may be able to help with a chargeback if you paid by card and didn't receive what you paid for.",
            "**Scams:** if you think you've been scammed, contact your bank immediately and report it at scamwatch.gov.au or cyber.gov.au. Please also tell us at hello@evntlyapp.com.",
            "**Small business disputes** between Vendors and Evntly: the NSW Small Business Commissioner (smallbusiness.nsw.gov.au) offers dispute help.",
          ],
        },
      ],
    },
    {
      id: "future",
      title: "11. Future online payments",
      blocks: [
        "Evntly plans to offer optional online milestone payments in the future. They are **not active**. If they are introduced, we'll update this policy to explain how payments, refunds and disputes work for those bookings, and ask you to accept the updated policy before it applies to you.",
      ],
    },
    {
      id: "contact",
      title: "12. Contact",
      blocks: ["Questions about this policy: hello@evntlyapp.com."],
    },
  ],
};
