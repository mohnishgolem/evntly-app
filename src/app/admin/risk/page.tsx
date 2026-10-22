import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { AdminRiskList } from "@/components/admin-risk-list";
import { RISK_SIGNALS, type RiskAccount } from "@/lib/risk";

export const metadata: Metadata = {
  title: "Risk",
  robots: { index: false, follow: false },
};


export default async function AdminRiskPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { needsEnrol } = await requireAdminPage("/admin/risk");
  if (needsEnrol) return <AdminMfaRequired />;
  const showReviewed = (await searchParams).show === "all";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_risk_overview", { p_days: 90 });
  const all = (Array.isArray(data) ? data : []) as unknown as RiskAccount[];
  const accounts = showReviewed ? all : all.filter((a) => !a.reviewed);
  const hidden = all.length - accounts.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading
        title="Risk"
        description="Accounts with warning signs from the last 90 days. Flags only — nothing is suspended automatically."
      />
      <details className="mb-6 rounded-2xl border border-border p-4 text-sm">
        <summary className="cursor-pointer font-medium">What the signals mean</summary>
        <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          {Object.entries(RISK_SIGNALS).map(([k, s]) => (
            <div key={k} className="contents">
              <dt className="font-medium">{s.label}</dt>
              <dd className="mb-1 text-muted-foreground sm:mb-0">{s.explain}</dd>
            </div>
          ))}
        </dl>
      </details>

      <p className="mb-3 text-sm text-muted-foreground">
        {accounts.length} to review
        {hidden > 0 && !showReviewed && (
          <>
            {" "}· {hidden} reviewed and hidden until something new happens ·{" "}
            <Link href="/admin/risk?show=all" className="underline underline-offset-2">
              show all
            </Link>
          </>
        )}
        {showReviewed && (
          <>
            {" "}·{" "}
            <Link href="/admin/risk" className="underline underline-offset-2">
              hide reviewed
            </Link>
          </>
        )}
      </p>

      {error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load risk signals.</p>
      ) : accounts.length === 0 ? (
        <p className="rounded-2xl bg-muted/60 p-5 text-sm text-muted-foreground">Nothing needs review.</p>
      ) : (
        <AdminRiskList accounts={accounts} />
      )}
    </div>
  );
}
