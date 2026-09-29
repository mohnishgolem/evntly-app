"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { login, signup, type AuthFormState } from "@/lib/actions/auth";

const initialState: AuthFormState = null;

export function AuthTabs({
  defaultTab = "signup",
  defaultRole = "customer",
}: {
  defaultTab?: "signup" | "login";
  defaultRole?: "customer" | "vendor";
}) {
  const router = useRouter();
  const [tab, setTab] = useState(defaultTab);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(v as "signup" | "login");
        router.replace(v === "signup" ? "/signup" : "/login");
      }}
      className="w-full"
    >
      {/* Sign Up is the first tab and the default — the call's core fix: new
          visitors should never land on a login form first. */}
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signup">Sign up</TabsTrigger>
        <TabsTrigger value="login">Log in</TabsTrigger>
      </TabsList>
      <TabsContent value="signup" className="pt-6">
        <SignupForm defaultRole={defaultRole} />
      </TabsContent>
      <TabsContent value="login" className="pt-6">
        <LoginForm />
      </TabsContent>
    </Tabs>
  );
}

function SignupForm({ defaultRole }: { defaultRole: "customer" | "vendor" }) {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const [role, setRole] = useState(defaultRole);

  if (state?.needsEmailConfirmation) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-6 text-center text-sm">
        <p className="mb-1 font-medium">Check your email</p>
        <p className="text-muted-foreground">
          We sent a confirmation link — click it to activate your account, then log in.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="role" value={role} />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRole("customer")}
          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
            role === "customer" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          I&apos;m planning an event
        </button>
        <button
          type="button"
          onClick={() => setRole("vendor")}
          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
            role === "vendor" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          I&apos;m a vendor
        </button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" placeholder="Jane Smith" required />
        {state?.fieldErrors?.fullName && (
          <p className="text-sm text-destructive">{state.fieldErrors.fullName[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="you@example.com" required />
        {state?.fieldErrors?.email && (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
        {state?.fieldErrors?.password && (
          <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      <div className="flex items-start gap-2">
        <Checkbox id="agreedToTerms" name="agreedToTerms" required />
        <Label htmlFor="agreedToTerms" className="text-sm leading-snug font-normal text-muted-foreground">
          I agree to Evntly&apos;s{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link href="/privacy-policy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
        </Label>
      </div>
      {state?.fieldErrors?.agreedToTerms && (
        <p className="text-sm text-destructive">{state.fieldErrors.agreedToTerms[0]}</p>
      )}

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </Button>
    </form>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" name="email" type="email" placeholder="you@example.com" required />
        {state?.fieldErrors?.email && (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input id="login-password" name="password" type="password" required />
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
