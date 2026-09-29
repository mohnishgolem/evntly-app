"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sendVendorMessage, type SendMessageState } from "@/lib/actions/messages";

const initialState: SendMessageState = null;

export function ContactVendor({
  isAuthenticated,
  vendorId,
  vendorOwnerEmail,
  vendorName,
}: {
  isAuthenticated: boolean;
  vendorId: string;
  vendorOwnerEmail: string | null;
  vendorName: string;
}) {
  const [open, setOpen] = useState(false);

  // This is the one place the call said the auth wall should exist: browsing
  // is free, but contacting a vendor requires an account.
  if (!isAuthenticated) {
    return (
      <Button
        size="lg"
        className="w-full"
        nativeButton={false}
        render={<Link href={`/signup?next=/vendor/${vendorId}`}>Sign up to send a message</Link>}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" className="w-full">
            <MessageCircle /> Contact vendor
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {vendorName}</DialogTitle>
        </DialogHeader>
        <MessageForm
          vendorId={vendorId}
          vendorOwnerEmail={vendorOwnerEmail ?? ""}
          onSent={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MessageForm({
  vendorId,
  vendorOwnerEmail,
  onSent,
}: {
  vendorId: string;
  vendorOwnerEmail: string;
  onSent: () => void;
}) {
  const action = sendVendorMessage.bind(null, vendorId, vendorOwnerEmail);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <p className="font-medium">Message sent!</p>
        <p className="text-sm text-muted-foreground">They&apos;ll get back to you soon.</p>
        <Button variant="outline" onClick={onSent} className="mt-2">
          Close
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <Textarea
        name="content"
        placeholder="Tell them about your event — date, location, what you need…"
        rows={5}
        required
      />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
