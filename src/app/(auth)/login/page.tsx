import type { Metadata } from "next";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { safeNextPath } from "@/lib/safe-redirect";
import { authNotice } from "@/lib/auth-notices";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Evntly account.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const notice = authNotice(params.notice);
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
      <p className="mb-6 text-sm text-muted-foreground">Log in to your Evntly account.</p>
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
              : "mb-6 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm"
          }
        >
          <p>{notice.text}</p>
          {"action" in notice && (
            <Link href={notice.action.href} className="mt-1 inline-block font-medium underline underline-offset-4">
              {notice.action.label}
            </Link>
          )}
        </div>
      )}
      <AuthTabs defaultTab="login" next={next} />
    </div>
  );
}
