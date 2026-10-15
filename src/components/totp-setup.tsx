"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  startTotpEnrollment,
  confirmTotpEnrollment,
  removeTotpFactor,
} from "@/lib/actions/mfa";

type Props =
  | { mode: "enroll" }
  | { mode: "remove"; factorId: string; verifiedThisSession: boolean };

export function TotpSetup(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");

  if (props.mode === "remove") {
    return (
      <div className="mt-3">
        {!props.verifiedThisSession && (
          <p className="mb-2 text-xs text-muted-foreground">
            To turn it off, log out and back in with your code first.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !props.verifiedThisSession}
          onClick={() =>
            startTransition(async () => {
              if (!confirm("Turn off two-factor authentication?")) return;
              const res = await removeTotpFactor(props.factorId);
              if (res?.error) setError(res.error);
              else router.refresh();
            })
          }
        >
          Turn off
        </Button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div>
        <p className="mb-3 font-semibold">Two-factor authentication is off</p>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await startTotpEnrollment();
              if ("error" in res) setError(res.error);
              else setEnrollment(res);
            })
          }
        >
          {pending ? "Starting…" : "Set up authenticator app"}
        </Button>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const res = await confirmTotpEnrollment(enrollment.factorId, code);
          if (res?.error) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <p className="text-sm">
        1. Scan this QR code with your authenticator app (or enter the key below).
      </p>
      {/* Supabase returns the QR code as an SVG data URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={enrollment.qrCode}
        alt="QR code for your authenticator app"
        className="size-44 rounded-xl bg-white p-2"
      />
      <p className="break-all font-mono text-xs text-muted-foreground">{enrollment.secret}</p>
      <div className="space-y-1.5">
        <Label htmlFor="totp-code">2. Enter the 6-digit code it shows</Label>
        <Input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Turn on"}
      </Button>
    </form>
  );
}
