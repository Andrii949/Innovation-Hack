import { cn } from "cn";
import { CircleCheck } from "lucide-react";

import type { CheckPlan, DueItem } from "@/api/types";
import { DataList, DataListItem } from "@/components/DataList";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { dueEquipmentId, dueKey } from "@/lib/due";
import { formatDue } from "@/lib/format";
import { dueKindLabel, type StatusColor, statusColor } from "@/lib/status";

const ACCENT: Record<StatusColor, string> = {
  error: "bg-red-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  default: "bg-border",
};

export function MyTasks({
  items,
  plans,
  onCheck,
  onStock,
}: {
  items: DueItem[];
  plans: CheckPlan[];
  onCheck: (equipmentId: string) => void;
  onStock: (reagentId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleCheck aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Brak zaległych zadań</EmptyTitle>
          <EmptyDescription>
            Wszystkie sprawdzenia i spisy w Twoich pracowniach są aktualne.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <DataList>
      {items.map((item) => {
        const equipmentId = item.kind === "CHECK" ? dueEquipmentId(item, plans) : null;
        return (
          <DataListItem key={dueKey(item)} className="relative pl-4">
            <span
              className={cn(
                "absolute inset-y-2 left-0 w-0.5 rounded-full",
                ACCENT[statusColor(item.status)],
              )}
              aria-hidden
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-wrap">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDue(item)} · {dueKindLabel(item.kind)}
                </p>
              </div>
              <StatusBadge status={item.status} className="shrink-0" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {equipmentId !== null && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onCheck(equipmentId);
                  }}
                >
                  Wpisz sprawdzenie
                </Button>
              )}
              {(item.kind === "STOCK_COUNT" || item.kind === "LOW_STOCK") && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onStock(item.refId);
                  }}
                >
                  Wpisz spis
                </Button>
              )}
            </div>
          </DataListItem>
        );
      })}
    </DataList>
  );
}
