import { describe, expect, it } from "bun:test";

import { matchesQuery, normalizeText } from "./search";

describe("search matching", () => {
  it("folds Polish diacritics and case", () => {
    expect(normalizeText("Waga Ąnalityczna — ŁÓDŹ")).toBe("waga analityczna — lodz");
  });

  it("matches any field and ignores surrounding spaces", () => {
    expect(matchesQuery("waga", "Waga analityczna", "LAB-1")).toBe(true);
    expect(matchesQuery("  lab-1  ", "Waga analityczna", "LAB-1")).toBe(true);
    expect(matchesQuery("waga", "Suszarka", "LAB-2")).toBe(false);
  });

  it("requires every token to match somewhere", () => {
    expect(matchesQuery("waga lab", "Waga analityczna", "LAB-1")).toBe(true);
    expect(matchesQuery("waga suszarka", "Waga analityczna", "LAB-1")).toBe(false);
  });

  it("treats an empty query as no filter and skips null fields", () => {
    expect(matchesQuery("   ", null, "cokolwiek")).toBe(true);
    expect(matchesQuery("x", null)).toBe(false);
  });

  it("matches a query without diacritics against a value with them", () => {
    expect(matchesQuery("lodz", "Łódź")).toBe(true);
    expect(matchesQuery("suszarka prozniowa", "Suszarka próżniowa")).toBe(true);
  });
});
