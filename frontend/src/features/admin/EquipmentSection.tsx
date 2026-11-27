import { cn } from "cn";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { EquipmentView } from "@/api/types";
import { DataList, DataListItem } from "@/components/DataList";
import { SortHead } from "@/components/SortHead";
import { type SortOption, SortSelect } from "@/components/SortSelect";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { formatDue } from "@/lib/format";
import { formatMonth } from "@/lib/months";
import { matchesQuery } from "@/lib/search";
import { statusSeverity } from "@/lib/status";
import { nextSort, sortRows, type SortState } from "@/lib/table";

type Column = "code" | "name" | "lab" | "lastCalibration" | "nextDue" | "status";

const ACCESSORS: Record<Column, (equipment: EquipmentView) => string | number | null> = {
  code: (equipment) => equipment.displayCode,
  name: (equipment) => equipment.name,
  lab: (equipment) => equipment.labName,
  lastCalibration: (equipment) => equipment.lastCalibration?.calibratedMonth ?? null,
  nextDue: (equipment) => equipment.nextDue?.validUntil ?? null,
  status: (equipment) => statusSeverity(equipment.status),
};

const SORT_OPTIONS: SortOption<Column>[] = [
  { column: "code", label: "Kod" },
  { column: "name", label: "Nazwa" },
  { column: "nextDue", label: "Najbliższy termin" },
  { column: "status", label: "Status" },
];

function nextDueLabel(equipment: EquipmentView): string {
  if (equipment.status === "WITHDRAWN") {
    return "Wycofane";
  }
  if (equipment.status === "NOT_REQUIRED") {
    return "Bez wzorcowania";
  }
  if (equipment.status === "NO_DATA" || equipment.nextDue === null) {
    return "Brak wpisu";
  }
  return formatDue(equipment.nextDue);
}

export function EquipmentSection({
  equipment,
  selectedId,
  onSelectId,
}: {
  equipment: EquipmentView[];
  selectedId: string | null;
  onSelectId: (equipmentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<Column>>({ column: "code", direction: "asc" });

  const filtered = useMemo(
    () =>
      equipment.filter((item) =>
        matchesQuery(
          query,
          item.displayCode,
          item.name,
          item.labName,
          item.location,
          item.serialNo,
          item.manufacturer,
          item.model,
        ),
      ),
    [equipment, query],
  );
  const sorted = useMemo(() => sortRows(filtered, sort, ACCESSORS), [filtered, sort]);

  const setSortBy = (column: Column): void => {
    setSort((current) => nextSort(current, column));
  };

  const emptyText =
    equipment.length === 0
      ? "Brak urządzeń w zakresie pracowni."
      : "Żadne urządzenie nie pasuje do frazy.";

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          placeholder="Kod, nazwa, pracownia, nr seryjny…"
          aria-label="Szukaj urządzenia"
          className="pl-9"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <SortSelect sort={sort} options={SORT_OPTIONS} onChange={setSort} />
        <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase tabular-nums">
          {sorted.length} / {equipment.length}
        </span>
      </div>

      <div className="sm:hidden">
        <DataList>
          {sorted.length === 0 && (
            <DataListItem className="text-sm text-muted-foreground">{emptyText}</DataListItem>
          )}
          {sorted.map((item) => (
            <DataListItem key={item.id} className="p-0">
              <button
                type="button"
                onClick={() => {
                  onSelectId(item.id);
                }}
                className={cn(
                  "flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50",
                  item.status === "WITHDRAWN" && "opacity-60",
                )}
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-muted-foreground">{item.displayCode}</p>
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.labName} · {nextDueLabel(item)}
                  </p>
                </div>
                <StatusBadge status={item.status} className="shrink-0" />
              </button>
            </DataListItem>
          ))}
        </DataList>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border/70 sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead column="code" label="Kod" sort={sort} onSort={setSortBy} />
              <SortHead column="name" label="Nazwa" sort={sort} onSort={setSortBy} />
              <SortHead column="lab" label="Pracownia" sort={sort} onSort={setSortBy} />
              <SortHead
                column="lastCalibration"
                label="Ostatnie wzorcowanie"
                sort={sort}
                onSort={setSortBy}
              />
              <SortHead column="nextDue" label="Następny termin" sort={sort} onSort={setSortBy} />
              <SortHead column="status" label="Status" sort={sort} onSort={setSortBy} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
            {sorted.map((item) => (
              <TableRow
                key={item.id}
                className={cn(
                  "cursor-pointer",
                  item.id === selectedId && "bg-accent/70",
                  item.status === "WITHDRAWN" && "opacity-60",
                )}
                onClick={() => {
                  onSelectId(item.id);
                }}
              >
                <TableCell>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 font-mono"
                    onClick={() => {
                      onSelectId(item.id);
                    }}
                  >
                    {item.displayCode}
                  </Button>
                </TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="whitespace-nowrap">{item.labName}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {item.lastCalibration === null
                    ? "—"
                    : formatMonth(item.lastCalibration.calibratedMonth)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{nextDueLabel(item)}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
