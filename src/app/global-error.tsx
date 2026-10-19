"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

// Replaces the root layout when it fails, so no app styles are available —
// keep this self-contained with inline styles.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#101014",
          color: "#f5f5f7",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>Something went wrong | Evntly</title>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#a1a1aa", marginBottom: 24 }}>We&apos;ve been notified. Please try again.</p>
          <button
            onClick={() => retry()}
            style={{ padding: "10px 20px", borderRadius: 999, border: 0, background: "#e8604a", color: "#fff", fontSize: 15 }}
          >
            Try again
          </button>
          {error.digest && <p style={{ marginTop: 24, fontSize: 12, color: "#71717a" }}>Reference {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
