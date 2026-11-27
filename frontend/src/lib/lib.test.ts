import { describe, expect, it } from "bun:test";

import type { Session } from "@/api/types";

import { dayLabel, monthGrid, monthLabel, shiftMonth } from "./calendar";
import { formatDate, formatDecimal, formatDue, formatRange } from "./format";
import { formatMonth, parseMonthInput } from "./months";
import { can } from "./permissions";
import { statusBadgeClass, statusColor, statusLabel } from "./status";

describe("presentation helpers", () => {
  it("formats and parses months", () => {
    expect(formatMonth("2026-12")).toBe("12/2026");
    expect(parseMonthInput("12/2026")).toBe("2026-12");
    expect(parseMonthInput("2026-12")).toBe("2026-12");
    expect(parseMonthInput("13/2026")).toBeNull();
    expect(parseMonthInput("12/26")).toBeNull();
  });

  it("labels statuses from docs/02 §4.2", () => {
    expect(statusLabel("DUE_SOON")).toBe("Zbliża się termin");
    expect(statusLabel("COUNT_DUE")).toBe("Zrób spis");
    expect(statusColor("OVERDUE")).toBe("error");
    expect(statusColor("OK")).toBe("success");
    expect(statusBadgeClass("LOW")).toContain("red");
  });

  it("formats measurements as Polish decimals", () => {
    expect(formatDecimal("3.35")).toBe("3,35");
    expect(formatRange("0.10", "3.20", "%")).toBe("0,10–3,20 %");
    expect(formatRange(null, null, "%")).toBe("bez zakresu");
    expect(formatDate("2026-11-27")).toBe("27.11.2026");
    expect(
      formatDue({
        kind: "CALIBRATION",
        refType: "equipment",
        refId: "eq",
        labId: "lab",
        label: "Waga",
        due: "2027-03-01",
        alertFrom: "2027-02-01",
        validUntil: "2027-03-31",
        status: "OK",
      }),
    ).toBe("03/2027");
    expect(
      formatDue({
        kind: "CALIBRATION",
        refType: "equipment",
        refId: "eq",
        labId: "lab",
        label: "Waga",
        due: null,
        alertFrom: null,
        validUntil: null,
        status: "NO_DATA",
      }),
    ).toBe("brak terminu");
  });

  it("checks only the capabilities the API issued", () => {
    const session: Session = {
      user: { id: "u", login: "u", fullName: "U" },
      role: { code: "ANY", name: "Any role" },
      permissions: ["check:write"],
      labIds: ["lab-a"],
      allLabs: false,
      authorizedEquipmentIds: [],
    };
    expect(can(session, "check:write")).toBe(true);
    expect(can(session, "calibration:write")).toBe(false);
  });
});

describe("calendar grid", () => {
  it("starts on Monday and pads full weeks with adjacent dates", () => {
    const grid = monthGrid("2026-11");
    expect(grid[0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(grid[6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(grid).toHaveLength(42);
    expect(grid[grid.length - 1]?.inMonth).toBe(false);
  });

  it("handles leap February and month labels", () => {
    expect(monthGrid("2028-02").filter((cell) => cell.inMonth)).toHaveLength(29);
    expect(monthLabel("2026-11")).toBe("listopad 2026");
    expect(dayLabel("2026-11-27")).toBe("piątek · 27.11.2026");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
