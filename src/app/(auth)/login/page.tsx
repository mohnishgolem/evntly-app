import type { Metadata } from "next";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Evntly account.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
      <p className="mb-6 text-sm text-muted-foreground">Log in to your Evntly account.</p>
      <AuthTabs defaultTab="login" next={next} />
    </div>
  );
}
