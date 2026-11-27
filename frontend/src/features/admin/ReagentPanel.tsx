import { cn } from "cn";

import type { ReagentView } from "@/api/types";
import { DataList, DataListItem } from "@/components/DataList";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDecimal } from "@/lib/format";

export function ReagentPanel({ reagents }: { reagents: ReagentView[] }) {
  if (reagents.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak odczynników w zakresie pracowni.</p>;
  }

  return (
    <>
      <div className="sm:hidden">
        <DataList>
          {reagents.map((reagent) => (
            <DataListItem key={reagent.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{reagent.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {reagent.kind === "CRM" ? "CRM" : "Odczynnik"} · {reagent.labName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Stan łączny: {formatDecimal(reagent.stock)} {reagent.unit}
                  </p>
                  <p
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      reagent.status === "LOW" && "text-red-700 dark:text-red-400",
                    )}
                  >
                    Zapas dostępny: {formatDecimal(reagent.usableStock)} {reagent.unit}
                  </p>
                  {reagent.recommendedLot !== null ? (
                    <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                      Użyj tej partii w pierwszej kolejności: {reagent.recommendedLot.lotNo}, ważna
                      do {formatDate(reagent.recommendedLot.expiryDate)}.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                      Brak ważnej partii z zapasem.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatDecimal(reagent.stock)} {reagent.unit}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      reagent.status === "LOW" && "text-red-700 dark:text-red-400",
                    )}
                  >
                    dostępne: {formatDecimal(reagent.usableStock)}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    próg {formatDecimal(reagent.minStock)}
                  </p>
                  <StatusBadge status={reagent.status} />
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
              <TableHead>Odczynnik</TableHead>
              <TableHead>Pracownia</TableHead>
              <TableHead className="text-right">Stan łączny</TableHead>
              <TableHead className="text-right">Zapas dostępny</TableHead>
              <TableHead className="text-right">Próg</TableHead>
              <TableHead>Partia do użycia</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reagents.map((reagent) => (
              <TableRow key={reagent.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{reagent.name}</span>
                    <Badge variant="secondary">
                      {reagent.kind === "CRM" ? "CRM" : "Odczynnik"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{reagent.labName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDecimal(reagent.stock)} {reagent.unit}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    reagent.status === "LOW" && "text-red-700 dark:text-red-400",
                  )}
                >
                  {formatDecimal(reagent.usableStock)} {reagent.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDecimal(reagent.minStock)} {reagent.unit}
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  {reagent.recommendedLot === null ? (
                    <span className="text-xs text-amber-800 dark:text-amber-300">
                      Brak ważnej partii z zapasem.
                    </span>
                  ) : (
                    <div>
                      <Badge
                        variant="outline"
                        className="border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        Użyj tej partii w pierwszej kolejności
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {reagent.recommendedLot.lotNo} · ważna do{" "}
                        {formatDate(reagent.recommendedLot.expiryDate)}
                      </p>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={reagent.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
