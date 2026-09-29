"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCombinedPackage, type PackageParticipantDraft } from "@/lib/actions/bundles";

export function CreateBundleForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [myPrice, setMyPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [participants, setParticipants] = useState<PackageParticipantDraft[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function addParticipant() {
    setParticipants((p) => [...p, { vendorEmail: "", vendorName: "", componentPrice: 0 }]);
  }

  function updateParticipant(i: number, patch: Partial<PackageParticipantDraft>) {
    setParticipants((p) => p.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeParticipant(i: number) {
    setParticipants((p) => p.filter((_, idx) => idx !== i));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createCombinedPackage({
        name,
        description,
        category,
        bundleDiscountAmount: Number(discount) || 0,
        myComponentPrice: Number(myPrice) || 0,
        participants: participants.filter((p) => p.vendorEmail && p.componentPrice > 0),
      });
      if (res?.error) setError(res.error);
    });
  }

  const canSubmit = name && Number(myPrice) > 0;

  return (
    <div className="space-y-4 rounded-2xl border border-border p-5">
      <div className="space-y-1.5">
        <Label htmlFor="bundle-name">Bundle name</Label>
        <Input
          id="bundle-name"
          placeholder="e.g. Photo + DJ Wedding Package"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bundle-desc">Description</Label>
        <Textarea
          id="bundle-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bundle-category">Category</Label>
          <Input
            id="bundle-category"
            placeholder="Wedding"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bundle-my-price">Your price ($)</Label>
          <Input
            id="bundle-my-price"
            type="number"
            min={1}
            value={myPrice}
            onChange={(e) => setMyPrice(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bundle-discount">Bundle discount ($)</Label>
          <Input
            id="bundle-discount"
            type="number"
            min={0}
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>Invite other vendors</Label>
          <Button type="button" size="sm" variant="outline" onClick={addParticipant}>
            <Plus /> Add vendor
          </Button>
        </div>
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You can create a solo bundle now and invite others later, or add them below.
          </p>
        ) : (
          <div className="space-y-2">
            {participants.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Vendor email</Label>
                  <Input
                    type="email"
                    value={p.vendorEmail}
                    onChange={(e) => updateParticipant(i, { vendorEmail: e.target.value })}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Business name</Label>
                  <Input
                    value={p.vendorName}
                    onChange={(e) => updateParticipant(i, { vendorName: e.target.value })}
                  />
                </div>
                <div className="w-28 space-y-1.5">
                  <Label className="text-xs">Price ($)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={p.componentPrice || ""}
                    onChange={(e) =>
                      updateParticipant(i, { componentPrice: Number(e.target.value) })
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => removeParticipant(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" disabled={!canSubmit || pending} onClick={submit}>
        {pending ? "Creating…" : "Create bundle"}
      </Button>
    </div>
  );
}
