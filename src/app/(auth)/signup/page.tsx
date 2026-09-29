import { AuthTabs } from "@/components/auth/auth-tabs";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">Join Evntly</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Create your account to plan an event or list your business.
      </p>
      <AuthTabs defaultTab="signup" defaultRole={role === "vendor" ? "vendor" : "customer"} />
    </div>
  );
}
