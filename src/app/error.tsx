"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/client-error";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Errors with a digest came from the server and were already logged by
    // onRequestError; only browser-side render errors need reporting here.
    if (!error.digest) reportClientError(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        We&apos;ve been notified and will look into it. Try again, or head back home.
      </p>
      <div className="flex justify-center gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/">Go home</Link>} />
      </div>
      {error.digest && <p className="mt-6 text-xs text-muted-foreground">Reference {error.digest}</p>}
    </div>
  );
}
