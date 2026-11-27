import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "default" | "error" | "warning" | "success";

const TONE: Record<Tone, { value: string; dot: string }> = {
  default: { value: "text-foreground", dot: "bg-muted-foreground/50" },
  error: { value: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  warning: { value: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  success: { value: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
};

export function MetricStrip({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-border">
      <div className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4">{children}</div>
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
    <div className="min-w-0 bg-card px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start gap-1.5">
        <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", TONE[tone].dot)} aria-hidden />
        <p className="line-clamp-2 font-mono text-[9px] leading-tight tracking-[0.1em] text-muted-foreground uppercase sm:text-[10px]">
          {label}
        </p>
        {Icon !== undefined && (
          <Icon
            className="mt-0.5 ml-auto hidden size-3.5 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />
        )}
      </div>
      <p
        className={cn(
          "mt-2 text-2xl leading-none font-semibold tracking-[-0.03em] tabular-nums sm:text-3xl",
          TONE[tone].value,
        )}
      >
        {value}
      </p>
      {hint !== undefined && (
        <p className="mt-1.5 hidden line-clamp-1 text-[11px] leading-snug text-muted-foreground sm:block">
          {hint}
        </p>
      )}
    </div>
  );
}
