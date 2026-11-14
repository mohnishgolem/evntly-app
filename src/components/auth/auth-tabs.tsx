"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { login, signup, signInWithOAuth, verifySignupCode, resendSignupCode, type AuthFormState } from "@/lib/actions/auth";
import { GoogleIcon, AppleIcon } from "@/components/auth/social-icons";
import { MARKETING_CONSENT_LABEL } from "@/lib/legal/versions";
import { trackFunnelEvent } from "@/lib/track-client";
import { metaPixelTrack } from "@/lib/meta-pixel";

const initialState: AuthFormState = null;

export function AuthTabs({
  defaultTab = "signup",
  defaultRole = "customer",
  next,
  inAppBrowser = false,
}: {
  defaultTab?: "signup" | "login";
  defaultRole?: "customer" | "vendor";
  next?: string;
  /** Instagram/Facebook's built-in browser, where Google sign-in is blocked. */
  inAppBrowser?: boolean;
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
        <SignupForm defaultRole={defaultRole} next={next} inAppBrowser={inAppBrowser} />
      </TabsContent>
      <TabsContent value="login" className="pt-6">
        <LoginForm next={next} inAppBrowser={inAppBrowser} />
      </TabsContent>
    </Tabs>
  );
}

// Apple isn't enabled as a provider in Supabase Auth yet (needs an Apple
// Developer account + Services ID). Flip this once it is.
const APPLE_SIGN_IN_ENABLED = false;

// Shown on both the signup and login forms — the call's ask was social
// sign-in "on all form variations", not just one.
function SocialButtons({ role, next, inAppBrowser }: { role?: "customer" | "vendor"; next?: string; inAppBrowser?: boolean }) {
  // Google blocks sign-in inside Instagram/Facebook's browser, so offer email
  // only there rather than a button that ends on Google's error page.
  if (inAppBrowser) {
    return (
      <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
        Google sign-in doesn&apos;t work inside Instagram or Facebook. Use your email below, or open this page in Safari or
        Chrome to use Google.
      </p>
    );
  }
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

function SignupForm({ defaultRole, next, inAppBrowser }: { defaultRole: "customer" | "vendor"; next?: string; inAppBrowser?: boolean }) {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const [role, setRole] = useState(defaultRole);
  // Controlled, and submitted via onSubmit rather than <form action>, so a
  // server-side error (e.g. a breached password) doesn't wipe what they typed
  // or untick the agreements: React resets a form after every form action.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToVendor, setAgreedToVendor] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  if (state?.needsEmailConfirmation) {
    return (
      <>
        {role === "vendor" && <CompleteRegistrationPing />}
        <ConfirmByCode email={state.email ?? email} next={state.next ?? next} />
      </>
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

      <SocialButtons role={role} next={next} inAppBrowser={inAppBrowser} />

      <form
        className="space-y-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (role === "vendor") trackFunnelEvent("signup_attempt");
          startTransition(() => formAction(data));
        }}
      >
      <input type="hidden" name="role" value={role} />
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          placeholder="Jane Smith"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        {state?.fieldErrors?.fullName && (
          <p className="text-sm text-destructive">{state.fieldErrors.fullName[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {state?.fieldErrors?.email && (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
          aria-invalid={!!state?.fieldErrors?.password || undefined}
        />
        {state?.fieldErrors?.password ? (
          <p id="password-hint" role="alert" className="text-sm text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        ) : (
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least 8 characters. Common or leaked passwords are blocked, so three random words works well.
          </p>
        )}
      </div>

      {/* Separate, unticked choices: required Terms (and Vendor Agreement for
          vendors), a Privacy notice, and optional marketing. */}
      <fieldset className="space-y-3">
        <legend className="sr-only">Agreements</legend>
        <div className="flex items-start gap-2">
          <Checkbox
            aria-labelledby="agreedToTerms-label"
            id="agreedToTerms"
            name="agreedToTerms"
            required
            aria-describedby="privacy-notice"
            checked={agreedToTerms}
            onCheckedChange={(v) => setAgreedToTerms(v === true)}
          />
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
              <Checkbox
                aria-labelledby="agreedToVendorAgreement-label"
                id="agreedToVendorAgreement"
                name="agreedToVendorAgreement"
                required
                checked={agreedToVendor}
                onCheckedChange={(v) => setAgreedToVendor(v === true)}
              />
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
          <Checkbox
            aria-labelledby="marketingOptIn-label"
            id="marketingOptIn"
            name="marketingOptIn"
            checked={marketingOptIn}
            onCheckedChange={(v) => setMarketingOptIn(v === true)}
          />
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

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </Button>
      </form>
    </div>
  );
}

// After sign-up: type the code from the confirmation email. Confirming here
// keeps the visitor signed in in *this* browser, which matters inside
// Instagram/Facebook, where the email link opens a different browser.
function ConfirmByCode({ email, next }: { email: string; next?: string }) {
  const [state, verifyAction, verifying] = useActionState(verifySignupCode, initialState);
  const [resendState, resendAction, resending] = useActionState(resendSignupCode, initialState);
  const [code, setCode] = useState("");
  const codeError = state?.fieldErrors?.code?.[0] ?? state?.fieldErrors?.email?.[0];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-5 text-sm">
        <p className="mb-1 font-medium">Check your email</p>
        <p className="text-muted-foreground">
          We sent a code to <span className="font-medium break-all text-foreground">{email}</span>. Enter it below to
          finish signing up. You can stay on this page.
        </p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => verifyAction(data));
        }}
      >
        <input type="hidden" name="email" value={email} />
        {next && <input type="hidden" name="next" value={next} />}
        <div className="space-y-1.5">
          <Label htmlFor="signup-code">Code from the email</Label>
          <Input
            id="signup-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 \-]*"
            maxLength={12}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-describedby="signup-code-hint"
            aria-invalid={!!codeError || undefined}
            className="text-center text-lg tracking-[0.3em] tabular-nums"
          />
          {codeError ? (
            <p id="signup-code-hint" role="alert" className="text-sm text-destructive">
              {codeError}
            </p>
          ) : (
            <p id="signup-code-hint" className="text-xs text-muted-foreground">
              Or tap the link in the email. If it opens in a different browser, log in there with the same password.
            </p>
          )}
        </div>
        {state?.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={verifying}>
          {verifying ? "Checking…" : "Confirm and continue"}
        </Button>
      </form>

      <form action={resendAction} className="text-center text-sm text-muted-foreground">
        <input type="hidden" name="email" value={email} />
        {next && <input type="hidden" name="next" value={next} />}
        {resendState?.resent ? (
          <p role="status">A new code is on its way. It can take a minute, so check your junk folder too.</p>
        ) : (
          <>
            No email?{" "}
            <button type="submit" disabled={resending} className="font-medium text-foreground underline underline-offset-2">
              {resending ? "Sending…" : "Send a new code"}
            </button>
          </>
        )}
        {resendState?.error && (
          <p role="alert" className="mt-1 text-destructive">
            {resendState.error}
          </p>
        )}
      </form>
    </div>
  );
}

function LoginForm({ next, inAppBrowser }: { next?: string; inAppBrowser?: boolean }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="space-y-4">
      <SocialButtons next={next} inAppBrowser={inAppBrowser} />
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

// Tells the Meta Pixel a vendor account was created. Does nothing until the
// pixel is switched on (see lib/meta-pixel.ts).
function CompleteRegistrationPing() {
  useEffect(() => metaPixelTrack("CompleteRegistration"), []);
  return null;
}
