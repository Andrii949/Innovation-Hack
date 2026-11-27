import { cn } from "cn";
import { useMemo, useState } from "react";

import type { TestResultView } from "@/api/types";
import { DataList, DataListItem } from "@/components/DataList";
import { SortHead } from "@/components/SortHead";
import { type SortOption, SortSelect } from "@/components/SortSelect";
import { TablePager } from "@/components/TablePager";
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
import { nextSort, paginate, sortRows, type SortState } from "@/lib/table";

const RANGE_BADGE_OK =
  "border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
const RANGE_BADGE_OUT =
  "border-red-600/25 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300";

type Column = "date" | "sample" | "parameter" | "value" | "verdict" | "repeat";

const ACCESSORS: Record<Column, (result: TestResultView) => string | number | null> = {
  date: (result) => result.sampledAt,
  sample: (result) => result.sampleLabel,
  parameter: (result) => result.parameterName,
  value: (result) => {
    const numeric = Number(result.value);
    return Number.isFinite(numeric) ? numeric : null;
  },
  verdict: (result) => (result.inRange ? 1 : 0),
  repeat: (result) => (result.repeat !== null ? 0 : result.inRange ? 2 : 1),
};

const SORT_OPTIONS: SortOption<Column>[] = [
  { column: "date", label: "Data (najnowsze)", direction: "desc" },
  { column: "sample", label: "Próbka" },
  { column: "parameter", label: "Parametr" },
  { column: "value", label: "Wynik" },
  { column: "verdict", label: "Ocena (poza zakresem najpierw)" },
  { column: "repeat", label: "Powtórzenie" },
];

export function ResultsTable({
  results,
  pageSize = 10,
  emptyText = "Brak wyników.",
}: {
  results: TestResultView[];
  pageSize?: number;
  emptyText?: string;
}) {
  const [sort, setSort] = useState<SortState<Column>>({ column: "date", direction: "desc" });
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => sortRows(results, sort, ACCESSORS), [results, sort]);
  const paged = paginate(sorted, page, pageSize);

  const setSortBy = (column: Column): void => {
    setSort((current) => nextSort(current, column));
    setPage(1);
  };

  const selectSort = (next: SortState<Column>): void => {
    setSort(next);
    setPage(1);
  };

  return (
    <div className="grid gap-2">
      <SortSelect sort={sort} options={SORT_OPTIONS} onChange={selectSort} />

      <div className="sm:hidden">
        <DataList>
          {paged.rows.length === 0 && (
            <DataListItem className="text-sm text-muted-foreground">{emptyText}</DataListItem>
          )}
          {paged.rows.map((result) => (
            <DataListItem key={result.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{result.sampleLabel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {result.parameterName} · {formatDate(result.sampledAt)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    Zakres {formatRange(result.minSnapshot, result.maxSnapshot, result.unit)}
                  </p>
                  {!result.inRange && result.repeat === null && (
                    <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">
                      Brak powtórzenia
                    </p>
                  )}
                  {result.repeat !== null && (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
                      Powtórzenie {formatDecimal(result.repeat.value)} {result.unit} ·{" "}
                      {formatDate(result.repeat.sampledAt)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      !result.inRange && "text-red-700 dark:text-red-400",
                    )}
                  >
                    {formatDecimal(result.value)} {result.unit}
                  </p>
                  <Badge
                    variant="outline"
                    className={result.inRange ? RANGE_BADGE_OK : RANGE_BADGE_OUT}
                  >
                    {result.inRange ? "W zakresie" : "Poza zakresem"}
                  </Badge>
                </div>
              </div>
            </DataListItem>
          ))}
        </DataList>
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead column="date" label="Data" sort={sort} onSort={setSortBy} />
              <SortHead column="sample" label="Próbka" sort={sort} onSort={setSortBy} />
              <SortHead column="parameter" label="Parametr" sort={sort} onSort={setSortBy} />
              <SortHead column="value" label="Wynik" align="right" sort={sort} onSort={setSortBy} />
              <TableHead>Zakres</TableHead>
              <SortHead column="verdict" label="Ocena" sort={sort} onSort={setSortBy} />
              <SortHead column="repeat" label="Powtórzenie" sort={sort} onSort={setSortBy} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((result) => (
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
                  <Badge
                    variant="outline"
                    className={result.inRange ? RANGE_BADGE_OK : RANGE_BADGE_OUT}
                  >
                    {result.inRange ? "W zakresie" : "Poza zakresem"}
                  </Badge>
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
                    <span className="font-medium text-red-700 dark:text-red-400">
                      Brak powtórzenia
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePager
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={pageSize}
        total={sorted.length}
        onPageChange={setPage}
      />
    </div>
  );
}
