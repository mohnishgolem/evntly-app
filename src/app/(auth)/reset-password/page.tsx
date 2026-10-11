"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updatePassword, type AuthFormState } from "@/lib/actions/auth";

const initialState: AuthFormState = null;

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">Set a new password</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Choose a new password for your Evntly account.
      </p>

      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" name="password" type="password" required />
          {state?.fieldErrors?.password && (
            <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
          )}
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </div>
  );
}
