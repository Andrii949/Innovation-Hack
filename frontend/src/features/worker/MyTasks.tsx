import { cn } from "cn";
import { CircleCheck } from "lucide-react";

import type { DueItem } from "@/api/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
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
  onCheck,
  onStock,
}: {
  items: DueItem[];
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
    <ItemGroup className="gap-0 divide-y">
      {items.map((item) => (
        <Item
          key={item.id}
          size="sm"
          className="relative flex-col items-stretch gap-2 py-3 pl-4 sm:flex-row sm:items-center"
        >
          <span
            className={cn(
              "absolute inset-y-2 left-0 w-0.5 rounded-full",
              ACCENT[statusColor(item.status)],
            )}
            aria-hidden
          />
          <ItemContent className="min-w-0">
            <ItemTitle className="text-wrap">{item.label}</ItemTitle>
            <ItemDescription>
              {formatDue(item)} · {dueKindLabel(item.kind)}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="w-full justify-between sm:w-auto sm:justify-end">
            <StatusBadge status={item.status} />
            {item.kind === "CHECK" && item.equipmentId !== null && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onCheck(item.equipmentId ?? "");
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
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
