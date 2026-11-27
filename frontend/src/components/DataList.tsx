import { cn } from "cn";
import type { ReactNode } from "react";

/** Stacked list used instead of a table on narrow screens. */
export function DataList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul
      className={cn(
        "divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function DataListItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("px-3 py-3", className)}>{children}</li>;
}
