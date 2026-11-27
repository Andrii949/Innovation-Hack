import { cn } from "cn";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import type { SortDirection, SortState } from "@/lib/table";

/** Clickable table header that cycles a column's sort order. */
export function SortHead<Column extends string>({
  column,
  label,
  sort,
  onSort,
  align = "left",
  className,
}: {
  column: Column;
  label: string;
  sort: SortState<Column>;
  onSort: (column: Column) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.column === column;
  const direction: SortDirection = sort.direction;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <TableHead
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => {
          onSort(column);
        }}
        className={cn(
          "group/sort -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-medium transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon
          className={cn(
            "size-3 shrink-0",
            active ? "opacity-80" : "opacity-40 group-hover/sort:opacity-70",
          )}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}

export type { SortState };
