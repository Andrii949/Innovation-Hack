import { FileText } from "lucide-react";

import type { Snapshot } from "@/api/types";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatDate, formatDateTime } from "@/lib/format";

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
      {snapshot.reports.map((report) => (
        <article key={report.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
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

            <p className="mt-3 text-xs text-muted-foreground">
              PDF (Typst) poza zakresem prototypu; dane i podsumowanie są pełne.
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
