"use client";

import { useState, useTransition } from "react";
import { Flag, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { reportVendor } from "@/lib/actions/reports";

const REASONS = [
  "Misleading listing",
  "Inappropriate content",
  "Scam or fraud",
  "No-show / unprofessional",
  "Other",
];

export function ReportVendor({
  isAuthenticated,
  vendorId,
  vendorEmail,
}: {
  isAuthenticated: boolean;
  vendorId: string;
  vendorEmail: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <Flag className="size-3" /> Report this vendor
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this vendor</DialogTitle>
        </DialogHeader>
        <ReportForm vendorId={vendorId} vendorEmail={vendorEmail} onSent={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ReportForm({
  vendorId,
  vendorEmail,
  onSent,
}: {
  vendorId: string;
  vendorEmail: string | null;
  onSent: () => void;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await reportVendor(vendorId, vendorEmail, reason, details);
      if (res?.error) setError(res.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <p className="font-medium">Report sent</p>
        <p className="text-sm text-muted-foreground">
          Thanks — our team will review this.
        </p>
        <Button variant="outline" onClick={onSent} className="mt-2">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              reason === r
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:border-foreground/30"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <Textarea
        rows={4}
        placeholder="What happened? (optional)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        variant="destructive"
        className="w-full"
        disabled={!reason || pending}
        onClick={submit}
      >
        {pending ? "Sending…" : "Submit report"}
      </Button>
    </div>
  );
}
