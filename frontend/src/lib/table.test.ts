import { describe, expect, it } from "bun:test";

import { nextSort, pageLabel, pageWindow, paginate, sortRows, type SortState } from "./table";

type Row = { name: string; due: string | null; count: number };

const ROWS: Row[] = [
  { name: "Waga", due: "2026-12-01", count: 3 },
  { name: "Suszarka", due: null, count: 1 },
  { name: "Maszyna wytrzymałościowa", due: "2026-01-15", count: 2 },
];

const ACCESSORS = {
  name: (row: Row) => row.name,
  due: (row: Row) => row.due,
  count: (row: Row) => row.count,
};

const byDue: SortState<keyof typeof ACCESSORS> = { column: "due", direction: "asc" };

describe("table sorting", () => {
  it("sorts alphabetically with Polish collation", () => {
    const rows = sortRows(ROWS, { column: "name", direction: "asc" }, ACCESSORS);
    expect(rows.map((row) => row.name)).toEqual(["Maszyna wytrzymałościowa", "Suszarka", "Waga"]);
  });

  it("sorts dates and numbers in both directions", () => {
    expect(sortRows(ROWS, byDue, ACCESSORS).map((row) => row.due)).toEqual([
      "2026-01-15",
      "2026-12-01",
      null,
    ]);
    expect(
      sortRows(ROWS, { column: "count", direction: "desc" }, ACCESSORS).map((row) => row.count),
    ).toEqual([3, 2, 1]);
  });

  it("keeps rows without data last in both directions", () => {
    expect(sortRows(ROWS, { ...byDue, direction: "desc" }, ACCESSORS).at(-1)?.due).toBeNull();
  });

  it("does not mutate the source rows", () => {
    sortRows(ROWS, byDue, ACCESSORS);
    expect(ROWS.map((row) => row.name)[0]).toBe("Waga");
  });

  it("cycles direction on the same column and starts ascending on a new one", () => {
    const first = nextSort<keyof typeof ACCESSORS>({ column: "name", direction: "asc" }, "name");
    expect(first).toEqual({ column: "name", direction: "desc" });
    expect(nextSort(first, "due")).toEqual({ column: "due", direction: "asc" });
  });
});

describe("table paging", () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1);

  it("slices rows and reports the page count", () => {
    const first = paginate(rows, 1, 10);
    expect(first.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(first.pageCount).toBe(3);
    expect(paginate(rows, 3, 10).rows).toEqual([21, 22, 23]);
  });

  it("clamps a page outside the range and keeps an empty table on page 1", () => {
    expect(paginate(rows, 9, 10).page).toBe(3);
    expect(paginate(rows, 0, 10).page).toBe(1);
    expect(paginate([], 4, 10)).toEqual({ rows: [], page: 1, pageCount: 1 });
  });

  it("labels the visible range", () => {
    expect(pageLabel(1, 8, 20)).toBe("1–8 z 20");
    expect(pageLabel(3, 8, 20)).toBe("17–20 z 20");
    expect(pageLabel(1, 8, 0)).toBe("0 z 0");
  });

  it("collapses the middle of a long page range", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5, "gap", 12]);
    expect(pageWindow(5, 12)).toEqual([1, "gap", 3, 4, 5, 6, 7, "gap", 12]);
    expect(pageWindow(12, 12)).toEqual([1, "gap", 8, 9, 10, 11, 12]);
  });
});
