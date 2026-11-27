import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "default" | "error" | "warning" | "success";

const TONE = {
  default: {
    value: "text-foreground",
    tile: "bg-muted text-muted-foreground",
    bar: "bg-primary/30",
  },
  error: {
    value: "text-red-700 dark:text-red-400",
    tile: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    bar: "bg-red-500",
  },
  warning: {
    value: "text-amber-700 dark:text-amber-400",
    tile: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  success: {
    value: "text-emerald-700 dark:text-emerald-400",
    tile: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
} as const;

export function MetricStrip({ children }: { children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-border shadow-sm">
      <span
        className="absolute inset-x-0 top-0 z-10 h-0.5 bg-linear-to-r from-brand-lime via-brand-navy to-brand-lime"
        aria-hidden
      />
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  return (
    <div className="relative bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </p>
        {Icon !== undefined && (
          <span
            className={cn("flex size-7 items-center justify-center rounded-md", TONE[tone].tile)}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-2 text-3xl leading-none font-semibold tracking-[-0.03em] tabular-nums",
          TONE[tone].value,
        )}
      >
        {value}
      </p>
      {hint !== undefined && (
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</p>
      )}
      <span
        className={cn("absolute inset-x-0 bottom-0 h-0.5 opacity-80", TONE[tone].bar)}
        aria-hidden
      />
    </div>
  );
}
