import { cn } from "cn";
import type { ReactNode } from "react";

import { formatDate } from "@/lib/format";

export function PageHeader({
  eyebrow,
  title,
  description,
  today,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  today: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      <span
        className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-brand-navy via-brand-navy to-brand-lime"
        aria-hidden
      />
      <div
        className="cement-grain pointer-events-none absolute inset-y-0 right-0 w-2/5 [mask-image:linear-gradient(to_left,black,transparent)]"
        aria-hidden
      />
      <div className="relative px-5 py-5 sm:px-7 sm:py-6">
        <p className="flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.22em] text-primary uppercase">
          <span className="h-px w-6 bg-brand-lime" aria-hidden />
          {eyebrow}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] sm:text-[2.15rem]">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          <p className="flex shrink-0 items-center gap-2 rounded-full border bg-background/70 px-3 py-1 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase backdrop-blur">
            <span className="size-1.5 rounded-full bg-chart-2" aria-hidden />
            Dziś {formatDate(today)}
          </p>
        </div>
        {children !== undefined && (
          <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 border-t pt-3">{children}</div>
        )}
      </div>
    </section>
  );
}

export function PageMeta({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "alert";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          tone === "alert" && "text-red-700 dark:text-red-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}
