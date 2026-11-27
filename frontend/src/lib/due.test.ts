import { describe, expect, it } from "bun:test";

import type { CheckPlan, DueItem, Lab } from "@/api/types";

import { dueEquipmentId, dueKey, dueLabName } from "./due";

const LABS: Lab[] = [
  { id: "lab-a", code: "A", name: "Pracownia Analityczna", active: true },
  { id: "lab-w", code: "W", name: "Pracownia Wytrzymałościowa", active: true },
];

const PLANS: CheckPlan[] = [
  {
    id: "cp-balance",
    equipmentId: "eq-balance",
    name: "Sprawdzenie wagi",
    intervalMonths: 1,
    leadMonths: 0,
    formTemplateId: "ft-1",
    active: true,
  },
];

function due(overrides: Partial<DueItem>): DueItem {
  return {
    kind: "CALIBRATION",
    refType: "equipment",
    refId: "eq-balance",
    labId: "lab-a",
    label: "121/A Waga",
    due: "2027-03-01",
    alertFrom: "2027-02-01",
    validUntil: "2027-03-31",
    status: "OK",
    ...overrides,
  };
}

describe("due item joins", () => {
  it("maps ref_type to the equipment card behind the row", () => {
    expect(dueEquipmentId(due({}), PLANS)).toBe("eq-balance");
    expect(
      dueEquipmentId(due({ kind: "CHECK", refType: "check_plan", refId: "cp-balance" }), PLANS),
    ).toBe("eq-balance");
    expect(
      dueEquipmentId(due({ kind: "CHECK", refType: "check_plan", refId: "cp-missing" }), PLANS),
    ).toBeNull();
    expect(
      dueEquipmentId(due({ kind: "LOW_STOCK", refType: "reagent", refId: "r-1" }), PLANS),
    ).toBeNull();
  });

  it("labels rows with the lab name and a stable key", () => {
    expect(dueLabName(due({ labId: "lab-w" }), LABS)).toBe("Pracownia Wytrzymałościowa");
    expect(dueLabName(due({ labId: "lab-x" }), LABS)).toBe("—");
    expect(dueKey(due({ kind: "CHECK", refType: "check_plan", refId: "cp-balance" }))).toBe(
      "CHECK:check_plan:cp-balance",
    );
  });
});
