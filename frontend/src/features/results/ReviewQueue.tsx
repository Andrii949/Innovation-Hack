import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { decideResultReview } from "@/api/demoClient";
import type { ResultReviewView } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDecimal, formatRange } from "@/lib/format";

function DecisionBadge({ review }: { review: ResultReviewView }) {
  if (review.decision === "PENDING") {
    return (
      <Badge
        variant="outline"
        className="border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      >
        Do weryfikacji
      </Badge>
    );
  }
  if (review.decision === "ACCEPTED") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        Zaakceptowany
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-red-600/25 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
    >
      Do powtórzenia
    </Badge>
  );
}

function decide(review: ResultReviewView, decision: "ACCEPTED" | "REPEAT"): void {
  const response = decideResultReview(review.id, decision);
  if (!response.ok) {
    toast.error("Decyzja nie została zapisana", { description: response.error.message });
    return;
  }
  toast.success(decision === "ACCEPTED" ? "Wynik zaakceptowany" : "Badanie do powtórzenia", {
    description: `${review.sampleLabel} · ${review.equipmentCode}: decyzja i autor zapisane.`,
  });
}

/** Results called back after a NOK calibration; decision and author are recorded. */
export function ReviewQueue({
  reviews,
  emptyText = "Brak wyników do weryfikacji.",
}: {
  reviews: ResultReviewView[];
  emptyText?: string;
}) {
  if (reviews.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <>
      <div className="grid gap-2 sm:hidden">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-border/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-muted-foreground">
                  {review.equipmentCode} · {formatDate(review.sampledAt)}
                </p>
                <p className="truncate text-sm font-medium">
                  {review.sampleLabel} · {review.parameterName}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatDecimal(review.value)} {review.unit} (
                  {formatRange(review.minSnapshot, review.maxSnapshot, review.unit)})
                </p>
              </div>
              <DecisionBadge review={review} />
            </div>
            {review.decision === "PENDING" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    decide(review, "ACCEPTED");
                  }}
                >
                  <Check aria-hidden />
                  Zaakceptuj
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    decide(review, "REPEAT");
                  }}
                >
                  <RotateCcw aria-hidden />
                  Powtórz badanie
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Decyzja: {review.decidedByName ?? "—"}
                {review.decidedAt === null ? "" : ` · ${formatDate(review.decidedAt.slice(0, 10))}`}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border/70 sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Urządzenie</TableHead>
              <TableHead>Próbka</TableHead>
              <TableHead>Parametr i wynik</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Decyzja</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((review) => (
              <TableRow key={review.id}>
                <TableCell className="whitespace-nowrap">
                  <span className="font-mono text-xs">{review.equipmentCode}</span>
                  <span className="block text-xs text-muted-foreground">
                    {review.equipmentName}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{review.sampleLabel}</TableCell>
                <TableCell>
                  <span className="block text-xs text-muted-foreground">
                    {review.parameterName}
                  </span>
                  <span className="tabular-nums">
                    {formatDecimal(review.value)} {review.unit}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                    ({formatRange(review.minSnapshot, review.maxSnapshot, review.unit)})
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(review.sampledAt)}</TableCell>
                <TableCell>
                  <DecisionBadge review={review} />
                  {review.decision === "PENDING" ? null : (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {review.decidedByName ?? "—"}
                      {review.decidedAt === null
                        ? ""
                        : ` · ${formatDate(review.decidedAt.slice(0, 10))}`}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {review.decision === "PENDING" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          decide(review, "ACCEPTED");
                        }}
                      >
                        Zaakceptuj
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          decide(review, "REPEAT");
                        }}
                      >
                        Powtórz
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Zapisano</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
