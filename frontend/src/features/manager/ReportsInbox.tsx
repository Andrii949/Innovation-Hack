import { cn } from "cn";
import { FileText } from "lucide-react";
import { useState } from "react";

import { acknowledgeReport } from "@/api/demoClient";
import type { Snapshot } from "@/api/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatDate, formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";

const SUMMARY_FIELDS = [
  ["equipment", "Urządzenia"],
  ["overdue", "Po terminie"],
  ["dueSoon", "Blisko terminu"],
  ["lowStock", "Mało"],
  ["checksInPeriod", "Sprawdzenia"],
  ["checksOutOfRange", "Sprawdzenia poza zakresem"],
  ["resultsInPeriod", "Wyniki"],
  ["resultsOutOfRange", "Wyniki poza zakresem"],
  ["repeatPending", "Do powtórzenia"],
] as const;

export function ReportsInbox({ snapshot }: { snapshot: Snapshot }) {
  const [error, setError] = useState<string | null>(null);
  const canAcknowledge = can(snapshot.session, "report:acknowledge");

  const acknowledge = (reportId: string): void => {
    const response = acknowledgeReport(reportId);
    setError(response.ok ? null : response.error.message);
  };

  if (snapshot.reports.length === 0) {
    return (
      <Empty className="py-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Brak raportów</EmptyTitle>
          <EmptyDescription>Biuro nie wysłało jeszcze raportu nadzoru.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-3">
      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {snapshot.reports.map((report) => (
        <article
          key={report.id}
          className={cn(
            "overflow-hidden rounded-xl border bg-card shadow-sm",
            report.status === "SENT"
              ? "border-l-2 border-l-amber-500"
              : "border-l-2 border-l-chart-2",
          )}
        >
          <header className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-3 py-2.5">
            <div>
              <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
                Dokument okresowy · wysłany {formatDateTime(report.sentAt)}
              </p>
              <p className="mt-1 font-semibold">{report.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(report.periodFrom)}–{formatDate(report.periodTo)} · wystawił{" "}
                {report.createdByName}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                report.status === "ACKNOWLEDGED"
                  ? "border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              }
            >
              {report.status === "ACKNOWLEDGED" ? "Potwierdzony" : "Do potwierdzenia"}
            </Badge>
          </header>

          <div className="p-3">
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border xl:grid-cols-9">
              {SUMMARY_FIELDS.map(([key, label]) => (
                <div key={key} className="bg-card px-2.5 py-2">
                  <dt className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                    {report.summary[key]}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {report.acknowledgedAt === null
                  ? "PDF (Typst) poza zakresem prototypu; dane i podsumowanie są pełne."
                  : `Potwierdził ${report.acknowledgedByName ?? "—"} · ${formatDateTime(report.acknowledgedAt)}`}
              </p>
              {report.acknowledgedAt === null && canAcknowledge && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    acknowledge(report.id);
                  }}
                >
                  Potwierdź odbiór
                </Button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
