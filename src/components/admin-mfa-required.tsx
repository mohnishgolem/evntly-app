import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export function AdminMfaRequired() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warning" />
      <h1 className="mb-2 text-2xl font-bold">Two-factor authentication required</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        The admin dashboard can approve vendors and change user roles, so it needs an
        authenticator app on your account.
      </p>
      <Link
        href="/profile/security"
        className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
      >
        Set up two-factor authentication
      </Link>
    </div>
  );
}

export function AdminHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
