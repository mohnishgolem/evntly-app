"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateReportStatus } from "@/lib/actions/admin";
import type { Database } from "@/lib/supabase/database.types";

type Report = Database["public"]["Tables"]["reports"]["Row"];

const STATUS_COLOR: Record<string, string> = {
  pending: "text-warning",
  reviewed: "text-primary",
  dismissed: "text-muted-foreground",
  actioned: "text-success",
};

export function AdminReports({ reports }: { reports: Report[] }) {
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No reports filed.</p>;
  }

  return (
    <div className="space-y-4">
      {reports.map((r) => (
        <ReportRow key={r.id} report={r} />
      ))}
    </div>
  );
}

function ReportRow({ report }: { report: Report }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const status = report.status ?? "pending";

  function act(next: "reviewed" | "dismissed" | "actioned") {
    startTransition(async () => {
      await updateReportStatus(report.id, next);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold capitalize ${STATUS_COLOR[status] ?? ""}`}>
          {status}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(report.created_at).toLocaleDateString()}
        </span>
      </div>
      <p className="mb-2 text-sm font-medium">{report.reason}</p>
      {report.details && <p className="mb-2 text-sm text-muted-foreground">{report.details}</p>}
      <p className="text-xs text-muted-foreground">
        Reporter: {report.reporter_email}
        {report.reported_email && <> · Reported: {report.reported_email}</>}
      </p>
      {status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act("reviewed")}>
            Mark Reviewed
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act("dismissed")}>
            Dismiss
          </Button>
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => act("actioned")}>
            Mark Actioned
          </Button>
        </div>
      )}
    </div>
  );
}
