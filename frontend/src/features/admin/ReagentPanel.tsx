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
                    {formatDate(reagent.lastCount?.countedOn ?? "")} · spis{" "}
                    {reagent.lastCount === null
                      ? "brak"
                      : `${formatDecimal(reagent.lastCount.quantity)} ${reagent.unit}`}
                  </p>
                  {reagent.nearestLot !== null && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Ważność {formatDate(reagent.nearestLot.expiryDate)} ·{" "}
                      {reagent.nearestLot.lotNo}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      reagent.status === "LOW" && "text-red-700 dark:text-red-400",
                    )}
                  >
                    {formatDecimal(reagent.stock)} {reagent.unit}
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
              <TableHead className="text-right">Stan</TableHead>
              <TableHead className="text-right">Próg</TableHead>
              <TableHead>Najbliższa ważność</TableHead>
              <TableHead>Ostatni spis</TableHead>
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
                <TableCell
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    reagent.status === "LOW" && "text-red-700 dark:text-red-400",
                  )}
                >
                  {formatDecimal(reagent.stock)} {reagent.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDecimal(reagent.minStock)} {reagent.unit}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {reagent.nearestLot === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span>
                      {formatDate(reagent.nearestLot.expiryDate)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({reagent.nearestLot.lotNo})
                      </span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {reagent.lastCount === null ? (
                    <span className="text-muted-foreground">Brak</span>
                  ) : (
                    <span>
                      {formatDate(reagent.lastCount.countedOn)}
                      <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                        {formatDecimal(reagent.lastCount.quantity)} {reagent.unit}
                      </span>
                    </span>
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
