"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requestPasswordReset, type AuthFormState } from "@/lib/actions/auth";

const initialState: AuthFormState = null;

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <Link
        href="/login"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to login
      </Link>
      <h1 className="mb-1 text-2xl font-bold">Reset your password</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter your account email and we&apos;ll send you a link to set a new password.
      </p>

      {state?.success ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-6 text-center text-sm">
          <p className="mb-1 font-medium">Check your email</p>
          <p className="text-muted-foreground">
            If an account exists for that address, we&apos;ve sent a link to reset your password.
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            {state?.fieldErrors?.email && (
              <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
            )}
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </div>
  );
}
