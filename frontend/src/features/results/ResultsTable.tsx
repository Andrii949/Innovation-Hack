import { cn } from "cn";

import type { TestResultView } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDecimal, formatRange } from "@/lib/format";

export function ResultsTable({
  results,
  limit,
  emptyText = "Brak wyników.",
}: {
  results: TestResultView[];
  limit?: number;
  emptyText?: string;
}) {
  const visible = limit === undefined ? results : results.slice(0, limit);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Próbka</TableHead>
          <TableHead>Parametr</TableHead>
          <TableHead className="text-right">Wynik</TableHead>
          <TableHead>Zakres</TableHead>
          <TableHead>Ocena</TableHead>
          <TableHead>Powtórzenie</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        )}
        {visible.map((result) => (
          <TableRow
            key={result.id}
            className={cn(!result.inRange && "bg-red-50/70 dark:bg-red-950/20")}
          >
            <TableCell className="whitespace-nowrap tabular-nums">
              {formatDate(result.sampledAt)}
            </TableCell>
            <TableCell className="font-medium">{result.sampleLabel}</TableCell>
            <TableCell>{result.parameterName}</TableCell>
            <TableCell
              className={cn(
                "text-right font-semibold tabular-nums",
                !result.inRange && "text-red-700 dark:text-red-400",
              )}
            >
              {formatDecimal(result.value)} {result.unit}
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatRange(result.minSnapshot, result.maxSnapshot, result.unit)}
            </TableCell>
            <TableCell>
              {result.inRange ? (
                <Badge
                  variant="outline"
                  className="border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  W zakresie
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-red-600/25 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                >
                  Poza zakresem
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-xs">
              {result.repeat !== null ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  {formatDecimal(result.repeat.value)} {result.unit} ·{" "}
                  {formatDate(result.repeat.sampledAt)}
                </span>
              ) : result.inRange ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="font-medium text-red-700 dark:text-red-400">Brak powtórzenia</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
