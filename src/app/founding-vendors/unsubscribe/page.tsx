import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/founding/unsubscribe-form";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

// A button rather than unsubscribing on page load: mail security scanners
// open every link in an email, which would unsubscribe people by accident.
// Mail apps use the one-click POST endpoint (/api/founding/unsubscribe).
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <h1 className="mb-2 text-2xl font-bold">Unsubscribe from vendor beta emails</h1>
      {token === "preview" ? (
        <p className="text-muted-foreground">This link came from a test email, so there&apos;s nothing to unsubscribe.</p>
      ) : (
        <>
          <p className="mb-6 text-muted-foreground">
            We&apos;ll stop emailing you about the Evntly founding vendor beta. If you have an Evntly account, your account emails
            (like booking updates) aren&apos;t affected.
          </p>
          <UnsubscribeForm token={token} />
        </>
      )}
      <p className="mt-8 text-sm text-muted-foreground">
        Problems? Email <a href="mailto:hello@evntlyapp.com" className="underline underline-offset-2">hello@evntlyapp.com</a> and we&apos;ll remove you.
      </p>
    </div>
  );
}
