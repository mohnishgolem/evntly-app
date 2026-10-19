"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

// Uncaught browser errors and unhandled promise rejections → error log.
// (Render errors are reported by the error boundaries in src/app.)
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
