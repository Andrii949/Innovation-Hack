/** Sorting and paging for client-side tables. Presentation only; data order comes from the API. */

export type SortDirection = "asc" | "desc";

export type SortState<Column extends string> = {
  column: Column;
  direction: SortDirection;
};

export type Cell = string | number | null;

/** Cycles a column: new column ascending, same column flips direction. */
export function nextSort<Column extends string>(
  current: SortState<Column>,
  column: Column,
): SortState<Column> {
  if (current.column !== column) {
    return { column, direction: "asc" };
  }
  return { column, direction: current.direction === "asc" ? "desc" : "asc" };
}

/**
 * Sorts a copy of `rows`. Empty cells stay last in both directions so a sort never buries missing
 * data behind filled rows.
 */
export function sortRows<Row, Column extends string>(
  rows: Row[],
  sort: SortState<Column>,
  accessors: Record<Column, (row: Row) => Cell>,
): Row[] {
  const value = accessors[sort.column];
  const direction = sort.direction === "asc" ? 1 : -1;

  return rows.toSorted((left, right) => {
    const a = value(left);
    const b = value(right);
    if (a === null || b === null) {
      if (a === b) {
        return 0;
      }
      return a === null ? 1 : -1;
    }
    const base =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b), "pl");
    return base * direction;
  });
}

export function paginate<Row>(
  rows: Row[],
  page: number,
  pageSize: number,
): { rows: Row[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page: current, pageCount };
}

/** Page numbers to render, with gaps when the range is wide. */
export function pageWindow(page: number, pageCount: number, span = 5): (number | "gap")[] {
  if (pageCount <= span + 2) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const start = Math.min(Math.max(1, page - Math.floor(span / 2)), pageCount - span + 1);
  const end = start + span - 1;
  const pages: (number | "gap")[] = [];

  if (start > 1) {
    pages.push(1);
    if (start > 2) {
      pages.push("gap");
    }
  }
  for (let value = start; value <= end; value += 1) {
    pages.push(value);
  }
  if (end < pageCount) {
    if (end < pageCount - 1) {
      pages.push("gap");
    }
    pages.push(pageCount);
  }
  return pages;
}

export function pageLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) {
    return "0 z 0";
  }
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `${start}–${end} z ${total}`;
}
