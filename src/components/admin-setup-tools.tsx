"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { PORTFOLIO_ACCEPT, PORTFOLIO_BUCKET } from "@/lib/portfolio-media";
import {
  adminAddSetupPackage,
  adminAddSetupPhoto,
  adminCloseSetupRequest,
  adminMarkSetupReady,
  adminSetupUploadUrl,
} from "@/lib/actions/admin-setup";

// Admin tools for one "set it up for me" request: add photos the vendor sent
// (uploaded into their own portfolio folder), add packages, then send the
// draft back to the vendor to check and submit.
export function AdminSetupTools({ requestId }: { requestId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [pkg, setPkg] = useState({ name: "", price: "", hours: "", inclusions: "", description: "" });
  const [note, setNote] = useState("");

  function run(fn: () => Promise<string | null>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage(result);
      router.refresh();
    });
  }

  function uploadPhotos(files: File[]) {
    run(async () => {
      let added = 0;
      for (const file of files) {
        const start = await adminSetupUploadUrl(requestId, { type: file.type, size: file.size });
        if (start.error || !start.path || !start.token) return `${file.name}: ${start.error ?? "couldn't start"}`;
        const { error } = await createClient()
          .storage.from(PORTFOLIO_BUCKET)
          .uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
        if (error) return `${file.name}: upload failed (${error.message})`;
        const res = await adminAddSetupPhoto(requestId, { path: start.path, type: file.type });
        if (res?.error) return `${file.name}: ${res.error}`;
        added++;
      }
      if (fileRef.current) fileRef.current.value = "";
      return `Added ${added} photo${added === 1 ? "" : "s"}.`;
    });
  }

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div className="space-y-1.5">
        <Label htmlFor={`photos-${requestId}`}>Add photos the vendor sent</Label>
        <Input
          ref={fileRef}
          id={`photos-${requestId}`}
          type="file"
          multiple
          accept={PORTFOLIO_ACCEPT}
          disabled={pending}
          onChange={(e) => uploadPhotos(Array.from(e.target.files ?? []))}
        />
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const res = await adminAddSetupPackage(requestId, {
              name: pkg.name,
              description: pkg.description,
              price: Number(pkg.price),
              includedHours: pkg.hours ? Number(pkg.hours) : null,
              extraHourPrice: null,
              inclusions: pkg.inclusions.split("\n").map((s) => s.trim()).filter(Boolean),
              deliveryDays: null,
              depositPercent: null,
              active: true,
            });
            if (res?.error) return res.error;
            setPkg({ name: "", price: "", hours: "", inclusions: "", description: "" });
            return "Package added.";
          });
        }}
      >
        <p className="text-sm font-medium">Add a package</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input aria-label="Package name" placeholder="Name" value={pkg.name} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} />
          <Input aria-label="Price in dollars" placeholder="Price ($)" inputMode="decimal" value={pkg.price} onChange={(e) => setPkg({ ...pkg, price: e.target.value })} />
          <Input aria-label="Hours included" placeholder="Hours (optional)" inputMode="decimal" value={pkg.hours} onChange={(e) => setPkg({ ...pkg, hours: e.target.value })} />
        </div>
        <Textarea aria-label="Description" rows={2} placeholder="Description (optional)" value={pkg.description} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} />
        <Textarea aria-label="Inclusions, one per line" rows={3} placeholder="Inclusions, one per line" value={pkg.inclusions} onChange={(e) => setPkg({ ...pkg, inclusions: e.target.value })} />
        <Button type="submit" variant="outline" disabled={pending || !pkg.name || !pkg.price}>
          Add package
        </Button>
      </form>

      <div className="space-y-2">
        <Label htmlFor={`note-${requestId}`}>Note to the vendor (optional)</Label>
        <Textarea id={`note-${requestId}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await adminMarkSetupReady(requestId, note);
                return res?.error ?? "Sent to the vendor to check and submit.";
              })
            }
          >
            Send to vendor to check
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await adminCloseSetupRequest(requestId);
                return res?.error ?? "Closed.";
              })
            }
          >
            Close request
          </Button>
        </div>
      </div>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
