import { useMemo, useState } from "react";

import type { CheckPlan, DueItem, Lab } from "@/api/types";
import { DataList, DataListItem } from "@/components/DataList";
import { SortHead } from "@/components/SortHead";
import { type SortOption, SortSelect } from "@/components/SortSelect";
import { StatusBadge } from "@/components/StatusBadge";
import { TablePager } from "@/components/TablePager";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { dueEquipmentId, dueKey, dueLabName } from "@/lib/due";
import { formatDue } from "@/lib/format";
import { dueKindLabel, statusSeverity } from "@/lib/status";
import { nextSort, paginate, sortRows, type SortState } from "@/lib/table";

type Column = "due" | "label" | "lab" | "kind" | "status";

const PAGE_SIZE = 20;

const SORT_OPTIONS: SortOption<Column>[] = [
  { column: "status", label: "Pilność" },
  { column: "due", label: "Termin" },
  { column: "label", label: "Pozycja" },
  { column: "lab", label: "Pracownia" },
  { column: "kind", label: "Rodzaj" },
];

export function ScheduleTable({
  items,
  plans,
  labs,
  onSelectEquipment,
}: {
  items: DueItem[];
  plans: CheckPlan[];
  labs: Lab[];
  onSelectEquipment: (equipmentId: string) => void;
}) {
  const [sort, setSort] = useState<SortState<Column>>({ column: "status", direction: "asc" });
  const [page, setPage] = useState(1);

  const accessors = useMemo(
    () => ({
      due: (item: DueItem) => item.validUntil,
      label: (item: DueItem) => item.label,
      lab: (item: DueItem) => dueLabName(item, labs),
      kind: (item: DueItem) => dueKindLabel(item.kind),
      status: (item: DueItem) => statusSeverity(item.status),
    }),
    [labs],
  );

  const sorted = useMemo(() => sortRows(items, sort, accessors), [items, sort, accessors]);
  const paged = paginate(sorted, page, PAGE_SIZE);

  const setSortBy = (column: Column): void => {
    setSort((current) => nextSort(current, column));
    setPage(1);
  };

  const selectSort = (next: SortState<Column>): void => {
    setSort(next);
    setPage(1);
  };

  return (
    <div className="grid gap-2">
      <SortSelect sort={sort} options={SORT_OPTIONS} onChange={selectSort} />

      <div className="sm:hidden">
        <DataList>
          {paged.rows.length === 0 && (
            <DataListItem className="text-sm text-muted-foreground">
              Brak pozycji dla wybranych filtrów.
            </DataListItem>
          )}
          {paged.rows.map((item) => {
            const equipmentId = dueEquipmentId(item, plans);
            return (
              <DataListItem key={dueKey(item)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {equipmentId === null ? (
                      <p className="text-sm font-medium">{item.label}</p>
                    ) : (
                      <button
                        type="button"
                        className="text-left text-sm font-medium underline-offset-4 hover:underline"
                        onClick={() => {
                          onSelectEquipment(equipmentId);
                        }}
                      >
                        {item.label}
                      </button>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDue(item)} · {dueKindLabel(item.kind)}
                    </p>
                    <p className="text-xs text-muted-foreground">{dueLabName(item, labs)}</p>
                  </div>
                  <StatusBadge status={item.status} className="shrink-0" />
                </div>
              </DataListItem>
            );
          })}
        </DataList>
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead column="due" label="Termin" sort={sort} onSort={setSortBy} />
              <SortHead column="label" label="Pozycja" sort={sort} onSort={setSortBy} />
              <SortHead column="lab" label="Pracownia" sort={sort} onSort={setSortBy} />
              <SortHead column="kind" label="Rodzaj" sort={sort} onSort={setSortBy} />
              <SortHead column="status" label="Status" sort={sort} onSort={setSortBy} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Brak pozycji dla wybranych filtrów.
                </TableCell>
              </TableRow>
            )}
            {paged.rows.map((item) => {
              const equipmentId = dueEquipmentId(item, plans);
              return (
                <TableRow key={dueKey(item)}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDue(item)}
                  </TableCell>
                  <TableCell className="max-w-[24rem] text-wrap">
                    {equipmentId !== null ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto justify-start p-0 text-left whitespace-normal"
                        onClick={() => {
                          onSelectEquipment(equipmentId);
                        }}
                      >
                        {item.label}
                      </Button>
                    ) : (
                      item.label
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{dueLabName(item, labs)}</TableCell>
                  <TableCell className="whitespace-nowrap">{dueKindLabel(item.kind)}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TablePager
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={PAGE_SIZE}
        total={sorted.length}
        onPageChange={setPage}
      />
    </div>
  );
}
