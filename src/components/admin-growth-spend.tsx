"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAcquisitionSpend, deleteAcquisitionSpend } from "@/lib/actions/admin-growth";
import { SPEND_CHANNELS } from "@/lib/growth";

const LABELS: Record<(typeof SPEND_CHANNELS)[number], string> = {
  meta_ads: "Meta ads",
  google_ads: "Google ads",
  instagram: "Instagram (boosts, creators)",
  events: "Events / expos",
  print: "Print",
  partnerships: "Partnerships (venues)",
  referral_rewards: "Referral rewards",
  tools: "Tools",
  other: "Other",
};

export function AdminSpendForm({ today }: { today: string }) {
  const [day, setDay] = useState(today);
  const [channel, setChannel] = useState<(typeof SPEND_CHANNELS)[number]>("meta_ads");
  const [audience, setAudience] = useState<"vendor" | "customer">("vendor");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[auto_auto_auto_auto_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addAcquisitionSpend({ day, channel, audience, amount: Number(amount), note });
          setMsg(res?.error ?? "Saved.");
          if (res?.success) {
            setAmount("");
            setNote("");
          }
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="sp-day">Day</Label>
        <Input id="sp-day" type="date" className="h-10 rounded-xl" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sp-ch">Channel</Label>
        <select id="sp-ch" className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
          {SPEND_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="sp-aud">For</Label>
        <select id="sp-aud" className="h-10 rounded-xl border border-input bg-background px-3 text-sm" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
          <option value="vendor">Vendors</option>
          <option value="customer">Customers</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="sp-amt">Amount (AUD)</Label>
        <Input id="sp-amt" type="number" min={0} step="0.01" required className="h-10 w-28 rounded-xl" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sp-note">Note</Label>
        <Input id="sp-note" className="h-10 rounded-xl" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending || amount === ""}>
        Add spend
      </Button>
      {msg && <p className="text-sm text-muted-foreground sm:col-span-6">{msg}</p>}
    </form>
  );
}

export function DeleteSpendButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-muted-foreground underline underline-offset-2"
      onClick={() => {
        if (confirm("Delete this spend entry?")) start(async () => void (await deleteAcquisitionSpend(id)));
      }}
    >
      Delete
    </button>
  );
}
