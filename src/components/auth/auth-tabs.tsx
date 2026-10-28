"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { login, signup, signInWithOAuth, type AuthFormState } from "@/lib/actions/auth";
import { GoogleIcon, AppleIcon } from "@/components/auth/social-icons";
import { MARKETING_CONSENT_LABEL } from "@/lib/legal/versions";

const initialState: AuthFormState = null;

export function AuthTabs({
  defaultTab = "signup",
  defaultRole = "customer",
  next,
}: {
  defaultTab?: "signup" | "login";
  defaultRole?: "customer" | "vendor";
  next?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(defaultTab);

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        setTab(v as "signup" | "login");
        const path = v === "signup" ? "/signup" : "/login";
        router.replace(next ? `${path}?next=${encodeURIComponent(next)}` : path);
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
        <SignupForm defaultRole={defaultRole} next={next} />
      </TabsContent>
      <TabsContent value="login" className="pt-6">
        <LoginForm next={next} />
      </TabsContent>
    </Tabs>
  );
}

// Apple isn't enabled as a provider in Supabase Auth yet (needs an Apple
// Developer account + Services ID). Flip this once it is.
const APPLE_SIGN_IN_ENABLED = false;

// Shown on both the signup and login forms — the call's ask was social
// sign-in "on all form variations", not just one.
function SocialButtons({ role, next }: { role?: "customer" | "vendor"; next?: string }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <form action={signInWithOAuth.bind(null, "google", role, next)} className="flex-1">
          <Button type="submit" variant="outline" className="w-full gap-2">
            <GoogleIcon /> Google
          </Button>
        </form>
        {APPLE_SIGN_IN_ENABLED && (
          <form action={signInWithOAuth.bind(null, "apple", role, next)} className="flex-1">
            <Button type="submit" variant="outline" className="w-full gap-2">
              <AppleIcon /> Apple
            </Button>
          </form>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or continue with email</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function SignupForm({ defaultRole, next }: { defaultRole: "customer" | "vendor"; next?: string }) {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const [role, setRole] = useState(defaultRole);

  if (state?.needsEmailConfirmation) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-6 text-center text-sm">
        <p className="mb-1 font-medium">Check your email</p>
        <p className="text-muted-foreground">
          {next
            ? "We sent a confirmation link. Open it on this device and you'll pick up right where you left off."
            : "We sent a confirmation link — click it to activate your account, then log in."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRole("customer")}
          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
            role === "customer" ? "border-highlight bg-highlight-light text-highlight" : "border-border text-muted-foreground"
          }`}
        >
          I&apos;m planning an event
        </button>
        <button
          type="button"
          onClick={() => setRole("vendor")}
          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
            role === "vendor" ? "border-highlight bg-highlight-light text-highlight" : "border-border text-muted-foreground"
          }`}
        >
          I&apos;m a vendor
        </button>
      </div>

      <SocialButtons role={role} next={next} />

      <form action={formAction} className="space-y-4">
      <input type="hidden" name="role" value={role} />
      {next && <input type="hidden" name="next" value={next} />}

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

      {/* Separate, unticked choices: required Terms (and Vendor Agreement for
          vendors), a Privacy notice, and optional marketing. */}
      <fieldset className="space-y-3">
        <legend className="sr-only">Agreements</legend>
        <div className="flex items-start gap-2">
          <Checkbox aria-labelledby="agreedToTerms-label" id="agreedToTerms" name="agreedToTerms" required aria-describedby="privacy-notice" />
          <Label id="agreedToTerms-label" htmlFor="agreedToTerms" className="text-sm leading-snug font-normal text-muted-foreground">
            <span>
              I agree to Evntly&apos;s{" "}
              <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link href="/cancellation-refund-dispute-policy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                Cancellation, Refund &amp; Dispute Policy
              </Link>
              . I&apos;m 18 or older.
            </span>
          </Label>
        </div>
        {state?.fieldErrors?.agreedToTerms && (
          <p className="text-sm text-destructive">{state.fieldErrors.agreedToTerms[0]}</p>
        )}

        {role === "vendor" && (
          <>
            <div className="flex items-start gap-2">
              <Checkbox aria-labelledby="agreedToVendorAgreement-label" id="agreedToVendorAgreement" name="agreedToVendorAgreement" required />
              <Label id="agreedToVendorAgreement-label" htmlFor="agreedToVendorAgreement" className="text-sm leading-snug font-normal text-muted-foreground">
                <span>
                  I agree to the{" "}
                  <Link href="/vendor-agreement" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                    Vendor Service Agreement
                  </Link>
                  , including the{" "}
                  <Link href="/vendor-agreement#schedule-1" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                    fee schedule
                  </Link>{" "}
                  (listing is currently free).
                </span>
              </Label>
            </div>
            {state?.fieldErrors?.agreedToVendorAgreement && (
              <p className="text-sm text-destructive">{state.fieldErrors.agreedToVendorAgreement[0]}</p>
            )}
          </>
        )}

        <div className="flex items-start gap-2">
          <Checkbox aria-labelledby="marketingOptIn-label" id="marketingOptIn" name="marketingOptIn" />
          <Label id="marketingOptIn-label" htmlFor="marketingOptIn" className="text-sm leading-snug font-normal text-muted-foreground">
            {MARKETING_CONSENT_LABEL}
          </Label>
        </div>

        <p id="privacy-notice" className="text-xs leading-relaxed text-muted-foreground">
          We&apos;ll use your details to run your account and connect you with{" "}
          {role === "vendor" ? "customers" : "vendors"}, as explained in our{" "}
          <Link href="/privacy-policy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          . Some providers we use process data overseas.
        </p>
      </fieldset>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </Button>
      </form>
    </div>
  );
}

function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="space-y-4">
      <SocialButtons next={next} />
      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="space-y-1.5">
          <Label id="login-email-label" htmlFor="login-email">Email</Label>
          <Input id="login-email" name="email" type="email" placeholder="you@example.com" required />
          {state?.fieldErrors?.email && (
            <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label id="login-password-label" htmlFor="login-password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Forgot password?
            </Link>
          </div>
          <Input id="login-password" name="password" type="password" required />
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </div>
  );
}
