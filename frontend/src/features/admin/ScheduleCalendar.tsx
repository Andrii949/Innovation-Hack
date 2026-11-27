import { cn } from "cn";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { DueItem, Status } from "@/api/types";
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
import { dayLabel, monthGrid, monthLabel, shiftMonth, WEEKDAY_LABELS } from "@/lib/calendar";
import { formatDate } from "@/lib/format";
import { dueKindLabel, statusBadgeClass, statusDotClass } from "@/lib/status";

const STATUS_RANK: Record<Status, number> = {
  OVERDUE: 0,
  NO_DATA: 1,
  LOW: 2,
  DUE_SOON: 3,
  COUNT_DUE: 4,
  OK: 5,
  WITHDRAWN: 6,
  NOT_REQUIRED: 7,
};

function sortItems(items: DueItem[]): DueItem[] {
  return items.toSorted(
    (left, right) =>
      STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
      left.validUntil.localeCompare(right.validUntil),
  );
}

function firstDateWithItems(items: DueItem[], month: string, fallback: string): string {
  const dates = items
    .filter((item) => item.status !== "NO_DATA" && item.validUntil.startsWith(month))
    .map((item) => item.validUntil)
    .toSorted();
  return dates[0] ?? fallback;
}

export function ScheduleCalendar({
  items,
  today,
  onSelectEquipment,
}: {
  items: DueItem[];
  today: string;
  onSelectEquipment: (equipmentId: string) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() =>
    firstDateWithItems(items, today.slice(0, 7), today),
  );

  const itemsByDate = useMemo(() => {
    const map = new Map<string, DueItem[]>();
    for (const item of sortItems(items)) {
      const bucket = map.get(item.validUntil) ?? [];
      bucket.push(item);
      map.set(item.validUntil, bucket);
    }
    return map;
  }, [items]);

  const backlog = useMemo(
    () => sortItems(items.filter((item) => item.status === "OVERDUE" || item.status === "NO_DATA")),
    [items],
  );
  const monthItems = useMemo(
    () => items.filter((item) => item.validUntil.startsWith(month)),
    [items, month],
  );
  const cells = useMemo(() => monthGrid(month), [month]);
  const selectedItems = itemsByDate.get(selectedDate) ?? [];
  const selectedDay = dayLabel(selectedDate);

  const goToMonth = (nextMonth: string, fallbackDate: string): void => {
    setMonth(nextMonth);
    setSelectedDate(firstDateWithItems(items, nextMonth, fallbackDate));
  };

  const moveMonth = (delta: number): void => {
    const nextMonth = shiftMonth(month, delta);
    goToMonth(nextMonth, `${nextMonth}-01`);
  };

  const jumpTo = (item: DueItem): void => {
    setMonth(item.validUntil.slice(0, 7));
    setSelectedDate(item.validUntil);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid gap-3">
        {backlog.length > 0 && (
          <div className="rounded-lg border border-red-200/80 bg-red-50/70 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="flex flex-wrap items-center gap-2">
              <TriangleAlert className="size-3.5 text-red-700 dark:text-red-400" aria-hidden />
              <p className="font-mono text-[9px] tracking-[0.14em] text-red-800 uppercase dark:text-red-300">
                Poza kalendarzem · {backlog.length}
              </p>
              <span className="text-xs text-muted-foreground">po terminie lub bez wpisu</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {backlog.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "max-w-60 truncate rounded-md border px-1.5 py-0.5 text-[10px]",
                    statusBadgeClass(item.status),
                  )}
                  onClick={() => {
                    jumpTo(item);
                  }}
                >
                  {item.label}
                </button>
              ))}
              {backlog.length > 4 && (
                <span className="px-1 py-0.5 text-[10px] text-muted-foreground">
                  +{backlog.length - 4}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Poprzedni miesiąc"
                onClick={() => {
                  moveMonth(-1);
                }}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <p className="w-36 text-center text-sm font-semibold capitalize sm:w-40">
                {monthLabel(month)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Następny miesiąc"
                onClick={() => {
                  moveMonth(1);
                }}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                goToMonth(today.slice(0, 7), today);
              }}
            >
              Dziś
            </Button>
            <span className="ml-auto font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
              {monthItems.length} pozycji w miesiącu
            </span>
          </div>

          <div className="grid grid-cols-7 gap-px bg-border">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="bg-muted/60 py-1.5 text-center font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase"
              >
                {label}
              </div>
            ))}
            {cells.map((cell) => (
              <button
                key={cell.date}
                type="button"
                aria-pressed={cell.date === selectedDate}
                aria-label={`${formatDate(cell.date)}, ${(itemsByDate.get(cell.date) ?? []).length} pozycji`}
                onClick={() => {
                  if (!cell.inMonth) {
                    setMonth(cell.date.slice(0, 7));
                  }
                  setSelectedDate(cell.date);
                }}
                className={cn(
                  "relative min-h-14 bg-card p-1 text-left align-top transition-colors hover:bg-accent/40 sm:min-h-20 sm:p-1.5",
                  !cell.inMonth && "bg-muted/30 text-muted-foreground",
                  cell.date === today && "bg-accent/30",
                  cell.date === selectedDate &&
                    "z-10 bg-accent/60 outline-2 -outline-offset-2 outline-primary",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[11px] font-medium tabular-nums",
                    cell.date === today
                      ? "bg-chart-2 text-primary"
                      : cell.inMonth
                        ? "text-foreground/70"
                        : "text-muted-foreground/60",
                  )}
                >
                  {Number(cell.date.slice(8, 10))}
                </span>

                <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                  {(itemsByDate.get(cell.date) ?? []).slice(0, 2).map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        "truncate rounded border px-1 py-0.5 text-[9px] leading-tight",
                        statusBadgeClass(item.status),
                      )}
                    >
                      {item.label}
                    </span>
                  ))}
                  {(itemsByDate.get(cell.date) ?? []).length > 2 && (
                    <span className="px-1 font-mono text-[9px] text-muted-foreground">
                      +{(itemsByDate.get(cell.date) ?? []).length - 2}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-0.5 sm:hidden">
                  {(itemsByDate.get(cell.date) ?? []).slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className={cn("size-1.5 rounded-full", statusDotClass(item.status))}
                    />
                  ))}
                  {(itemsByDate.get(cell.date) ?? []).length > 0 && (
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {(itemsByDate.get(cell.date) ?? []).length}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="min-w-0 overflow-hidden rounded-xl border bg-card self-start shadow-sm">
        <div className="border-b bg-muted/30 px-3 py-2">
          <p className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
            Agenda dnia
          </p>
          <p className="mt-0.5 text-sm font-semibold capitalize">{selectedDay}</p>
        </div>
        {selectedItems.length === 0 ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Brak terminów</EmptyTitle>
              <EmptyDescription>W tym dniu nie ma zaplanowanych pozycji.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-0 divide-y">
            {selectedItems.map((item) => (
              <Item key={item.id} size="xs" className="flex-col items-stretch gap-2 py-2.5">
                <ItemContent className="min-w-0">
                  <ItemTitle className="text-wrap text-[13px]">{item.label}</ItemTitle>
                  <ItemDescription>
                    {dueKindLabel(item.kind)} · {item.labName}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="w-full justify-between">
                  <StatusBadge status={item.status} />
                  {item.equipmentId !== null && (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        onSelectEquipment(item.equipmentId ?? "");
                      }}
                    >
                      Karta
                    </Button>
                  )}
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        <div className="flex items-center gap-1.5 border-t bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
          <CalendarClock className="size-3" aria-hidden />
          Kliknij dzień, aby zobaczyć agendę.
        </div>
      </aside>
    </div>
  );
}
