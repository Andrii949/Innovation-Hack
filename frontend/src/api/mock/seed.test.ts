import { describe, expect, it } from "bun:test";

import { createDb } from "./seed";

describe("demo seed", () => {
  it("hands out independent copies so reset discards demo writes", () => {
    const first = createDb();
    const calibrations = first.calibrations.length;
    first.calibrations.push({
      id: "cal-test",
      equipmentId: "eq-balance",
      calibratedMonth: "2026-11",
      vendor: "Test",
      certificateNo: "T/1",
      adjustments: "",
      result: "OK",
      nextDueMonth: "2027-11",
      note: "",
      points: [],
    });
    first.checkRecords[0]!.outOfRange = true;

    const second = createDb();
    expect(second.calibrations).toHaveLength(calibrations);
    expect(second.checkRecords[0]?.outOfRange).toBe(false);
    expect(second.notifications.length).toBeGreaterThan(0);
  });
});
