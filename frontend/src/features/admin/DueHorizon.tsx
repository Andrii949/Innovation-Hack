import { cn } from "cn";
import { useMemo } from "react";

import type { DueItem, Status } from "@/api/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Tone = "error" | "warning" | "default";

const BAR_CLASS: Record<Tone, string> = {
  error: "bg-red-500",
  warning: "bg-amber-500",
  default: "bg-primary",
};

function shiftMonth(ym: string, delta: number): string {
  const [yearPart = "0", monthPart = "1"] = ym.split("-");
  const total = Number(yearPart) * 12 + (Number(monthPart) - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function alertTone(statuses: Status[]): Tone {
  if (statuses.some((status) => status === "OVERDUE" || status === "NO_DATA")) {
    return "error";
  }
  if (
    statuses.some((status) => status === "DUE_SOON" || status === "LOW" || status === "COUNT_DUE")
  ) {
    return "warning";
  }
  return "default";
}

function BucketBar({ height, tone }: { height: number; tone: Tone }) {
  const style = useMemo(() => ({ height: `${height}%` }), [height]);
  return (
    <div className="flex h-full w-full items-end" aria-hidden>
      <div
        className={cn(
          "w-full rounded-[2px] transition-[height]",
          height === 0 ? "bg-border" : BAR_CLASS[tone],
        )}
        style={style}
      />
    </div>
  );
}

export function DueHorizon({ items, today }: { items: DueItem[]; today: string }) {
  const months = useMemo(() => {
    const start = today.slice(0, 7);
    const overdue = items.filter((item) => item.status === "OVERDUE");
    const future = items.filter((item) => item.status !== "OVERDUE");
    return Array.from({ length: 6 }, (_, index) => {
      const month = shiftMonth(start, index);
      const inMonth = future.filter((item) => item.validUntil?.startsWith(month) === true);
      const bucketItems = index === 0 ? [...overdue, ...inMonth] : inMonth;
      return {
        month,
        label: index === 0 ? "Teraz" : `${month.slice(5)}/${month.slice(2, 4)}`,
        items: bucketItems,
        tone: alertTone(bucketItems.map((item) => item.status)),
        overdue: index === 0 ? overdue.length : 0,
      };
    });
  }, [items, today]);

  const maximum = Math.max(1, ...months.map((bucket) => bucket.items.length));
  const overdueTotal = items.filter((item) => item.status === "OVERDUE").length;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
        <p className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
          Horyzont terminów · 6 miesięcy
        </p>
        <p className="text-xs text-muted-foreground">
          {items.length} pozycji ·{" "}
          <span className="text-red-700 dark:text-red-400">{overdueTotal} zaległych</span>
        </p>
      </div>
      <div className="grid grid-cols-6 gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        {months.map((bucket) => (
          <Tooltip key={bucket.month}>
            <TooltipTrigger asChild>
              <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-md">
                <div className="flex h-16 w-full items-end rounded-md bg-muted/40 p-1">
                  <BucketBar
                    height={
                      bucket.items.length === 0
                        ? 2
                        : Math.max(6, Math.round((bucket.items.length / maximum) * 48))
                    }
                    tone={bucket.tone}
                  />
                </div>
                <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                  {bucket.label}
                </span>
                <span className="text-xs font-semibold tabular-nums">{bucket.items.length}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {bucket.items.length === 0
                ? "Brak pozycji w tym miesiącu"
                : `${bucket.items.length} pozycji${bucket.overdue > 0 ? ` · ${bucket.overdue} już po terminie` : ""}`}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </section>
  );
}
