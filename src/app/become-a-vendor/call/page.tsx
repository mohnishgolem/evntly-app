import type { Metadata } from "next";
import Link from "next/link";
import { CallRequestForm } from "@/components/vendor-journey/call-request-form";
import { LAUNCH_CITY } from "@/lib/config";

export const metadata: Metadata = {
  title: "Request a call about listing your business",
  description: `Prefer to talk it through? Evntly's assistant can call you about listing your ${LAUNCH_CITY} event business, for free.`,
  robots: { index: false, follow: true },
};

// A quiet alternative to the builder for vendors who'd rather talk. Linked
// from the "Prefer to talk?" line on /become-a-vendor and from DMs.
export default function RequestCallPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-[28px] font-bold tracking-tight sm:text-[36px]">Prefer a quick call?</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
        Our AI assistant can call you to answer questions, send you the link, or arrange for us to set up your listing for you. It takes
        a couple of minutes, and you can ask for a person or say stop at any time.
      </p>
      <div className="mt-8 rounded-card border border-border bg-background p-5 sm:p-6">
        <CallRequestForm />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Rather do it yourself? <Link href="/become-a-vendor/start" className="font-medium underline underline-offset-2">Start your free listing</Link>.
      </p>
    </main>
  );
}
