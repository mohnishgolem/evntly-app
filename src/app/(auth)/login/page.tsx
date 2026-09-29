import { AuthTabs } from "@/components/auth/auth-tabs";

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
      <p className="mb-6 text-sm text-muted-foreground">Log in to your Evntly account.</p>
      <AuthTabs defaultTab="login" />
    </div>
  );
}
