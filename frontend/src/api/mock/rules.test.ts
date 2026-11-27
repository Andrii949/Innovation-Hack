import { describe, expect, it } from "bun:test";

import { addDays, addMonths, addMonthsToDateClamped, isIsoDate, lastOfMonth } from "./dates";
import {
  addDecimals,
  compareDecimals,
  isInRange,
  normalizeDecimal,
  subtractDecimals,
} from "./decimal";
import {
  calibrationWindow,
  checkWindow,
  expiryWindow,
  statusForWindow,
  stockCountWindow,
} from "./due";

const TODAY = "2026-11-27";

describe("date arithmetic", () => {
  it("keeps ISO months across year boundaries", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -2)).toBe("2026-11");
    expect(lastOfMonth("2028-02")).toBe("2028-02-29");
  });

  it("clamps a day to the target month", () => {
    expect(addMonthsToDateClamped("2027-05-31", -6)).toBe("2026-11-30");
    expect(addMonthsToDateClamped("2026-01-15", 1)).toBe("2026-02-15");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isIsoDate("2026-02-29")).toBe(false);
  });
});

describe("due dates (docs/02 §4.3)", () => {
  it("classifies calibration windows", () => {
    expect(calibrationWindow("2026-03", 12, 1, TODAY)).toMatchObject({
      alertFrom: "2027-02-01",
      validUntil: "2027-03-31",
      status: "OK",
    });
    expect(calibrationWindow("2025-12", 12, 1, TODAY).status).toBe("DUE_SOON");
    expect(calibrationWindow("2025-10", 12, 1, TODAY)).toMatchObject({
      alertFrom: "2026-09-01",
      validUntil: "2026-10-31",
      status: "OVERDUE",
    });
  });

  it("classifies CRM expiry with a clamped alert start", () => {
    expect(expiryWindow("2027-05-31", 6, TODAY)).toMatchObject({
      alertFrom: "2026-11-30",
      validUntil: "2027-05-31",
      status: "OK",
    });
    expect(expiryWindow("2026-11-27", 1, TODAY).status).toBe("DUE_SOON");
  });

  it("classifies checks with zero lead", () => {
    expect(checkWindow("2026-11-05", 1, 0, TODAY)).toMatchObject({
      alertFrom: "2026-12-01",
      validUntil: "2026-12-31",
      status: "OK",
    });
    expect(checkWindow("2026-09-20", 1, 0, TODAY).status).toBe("OVERDUE");
  });

  it("marks a stock count due only after the interval", () => {
    expect(stockCountWindow("2026-10-01", 30, TODAY)).toEqual({
      due: "2026-10-31",
      status: "COUNT_DUE",
    });
    expect(stockCountWindow("2026-11-10", 30, TODAY).status).toBe("OK");
    expect(stockCountWindow(null, 30, TODAY).status).toBe("COUNT_DUE");
    expect(statusForWindow("2026-12-01", "2026-12-31", TODAY)).toBe("OK");
  });
});

describe("measurements stay exact decimals", () => {
  it("accepts a comma and preserves the entered precision", () => {
    expect(normalizeDecimal("0,10")).toBe("0.10");
    expect(normalizeDecimal("+3.350")).toBe("3.350");
    expect(normalizeDecimal("3,3,5")).toBeNull();
    expect(normalizeDecimal("")).toBeNull();
  });

  it("compares without floating point", () => {
    expect(compareDecimals("0.10", "0,1")).toBe(0);
    expect(compareDecimals("3.35", "3.2")).toBe(1);
    expect(compareDecimals("0.005", "0.105")).toBe(-1);
    expect(addDecimals("120", "50.5")).toBe("170.5");
    expect(subtractDecimals("500", "0.10")).toBe("499.9");
  });

  it("checks inclusive ranges", () => {
    expect(isInRange("3.20", "0.10", "3.20")).toBe(true);
    expect(isInRange("3.35", "0.10", "3.20")).toBe(false);
    expect(isInRange("0.004", "0.005", "0.105")).toBe(false);
    expect(isInRange("0.0001", null, null)).toBe(true);
  });
});
