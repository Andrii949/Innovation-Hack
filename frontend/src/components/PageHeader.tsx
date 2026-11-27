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
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="flex min-w-0 items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            <span className="size-1.5 shrink-0 rounded-full bg-brand-lime" aria-hidden />
            <span>{eyebrow}</span>
          </p>
          <p className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-muted-foreground tabular-nums">
            Dziś {formatDate(today)}
          </p>
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground sm:max-w-2xl">
          {description}
        </p>
        {children !== undefined && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3 sm:flex sm:flex-wrap sm:gap-x-8">
            {children}
          </div>
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
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          "truncate text-xs font-medium tabular-nums",
          tone === "alert" && "text-red-700 dark:text-red-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}
