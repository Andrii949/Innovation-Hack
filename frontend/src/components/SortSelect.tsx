import { cn } from "cn";
import { ChevronDown } from "lucide-react";

import type { SortDirection, SortState } from "@/lib/table";

export type SortOption<Column extends string> = {
  column: Column;
  label: string;
  direction?: SortDirection;
};

/** Touch-sized sort chooser shown where table headers are not (phones). */
export function SortSelect<Column extends string>({
  sort,
  options,
  onChange,
}: {
  sort: SortState<Column>;
  options: SortOption<Column>[];
  onChange: (sort: SortState<Column>) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
      <span className="shrink-0">Sortuj</span>
      <span className="relative flex-1">
        <select
          value={sort.column}
          onChange={(event) => {
            const option = options.find((candidate) => candidate.column === event.target.value);
            if (option !== undefined) {
              onChange({ column: option.column, direction: option.direction ?? "asc" });
            }
          }}
          className={cn(
            "h-9 w-full appearance-none rounded-lg border border-input bg-transparent pr-8 pl-3 text-sm text-foreground",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
        >
          {options.map((option) => (
            <option key={option.column} value={option.column}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </span>
    </label>
  );
}
