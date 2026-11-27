import { cn } from "cn";

import type { ReagentView } from "@/api/types";
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
  return (
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
        {reagents.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
              Brak odczynników w zakresie pracowni.
            </TableCell>
          </TableRow>
        )}
        {reagents.map((reagent) => (
          <TableRow key={reagent.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className="font-medium">{reagent.name}</span>
                <Badge variant="secondary">{reagent.kind === "CRM" ? "CRM" : "Odczynnik"}</Badge>
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
  );
}
