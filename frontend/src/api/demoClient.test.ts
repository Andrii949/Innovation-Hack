import { beforeEach, describe, expect, it } from "bun:test";

import {
  addTestResult,
  generateReport,
  getSnapshot,
  markAllNotificationsRead,
  recordCalibration,
  recordCheck,
  recordStockCount,
  resetDemo,
  switchRole,
} from "./demoClient";

beforeEach(() => {
  resetDemo();
  switchRole("ADMIN");
});

describe("demoClient end-to-end workflows", () => {
  it("orders overdue schedule items first, exposes withdrawn status, and records calibrations", () => {
    const initial = getSnapshot();
    const statuses = initial.schedule.map((item) => item.status);
    expect(statuses).toContain("OVERDUE");
    expect(statuses).toContain("DUE_SOON");
    expect(statuses.indexOf("OVERDUE")).toBeLessThan(statuses.indexOf("DUE_SOON"));

    const withdrawn = initial.equipment.find((eq) => eq.status === "WITHDRAWN");
    expect(withdrawn).toBeDefined();
    expect(withdrawn?.canWriteCheck).toBe(false);

    const overdueEq = initial.equipment.find(
      (eq) => eq.status === "OVERDUE" && eq.calibrationRequired,
    );
    expect(overdueEq).toBeDefined();

    const okResult = recordCalibration({
      equipmentId: overdueEq!.id,
      calibratedMonth: "2026-11",
      vendor: "Termis",
      certificateNo: "TM/2026/1101",
      adjustments: "Brak",
      result: "OK",
      note: "",
      reviewPeriodFrom: null,
      reviewPeriodTo: null,
      points: [{ point: "105 °C", error: "0,2", uncertainty: "0,1", unit: "°C" }],
    });
    expect(okResult.ok).toBe(true);
    if (okResult.ok) {
      expect(okResult.data.points[0]?.error).toBe("0.2");
      expect(okResult.data.points[0]?.uncertainty).toBe("0.1");
      expect(okResult.data.nextDueMonth).toBe("2027-11");
    }

    const afterOk = getSnapshot();
    const updatedEq = afterOk.equipment.find((eq) => eq.id === overdueEq!.id);
    expect(updatedEq?.status).toBe("OK");
    expect(afterOk.audit.some((entry) => entry.entity === "calibration")).toBe(true);

    const otherEq = afterOk.equipment.find(
      (eq) => eq.id !== overdueEq!.id && eq.calibrationRequired,
    );
    expect(otherEq).toBeDefined();
    const nokResult = recordCalibration({
      equipmentId: otherEq!.id,
      calibratedMonth: "2026-11",
      vendor: "Testo Polska",
      certificateNo: "TP/2026/1102",
      adjustments: "Odchyłka poza limitem",
      result: "NOK",
      note: "Do weryfikacji",
      reviewPeriodFrom: "2026-09-01",
      reviewPeriodTo: "2026-11-27",
      points: [{ point: "20 °C", error: "1,5", uncertainty: "0,2", unit: "°C" }],
    });
    expect(nokResult.ok).toBe(true);
    const refreshedOther = getSnapshot().equipment.find((eq) => eq.id === otherEq!.id);
    expect(refreshedOther?.calibrations.some((cal) => cal.result === "NOK")).toBe(true);
  });

  it("enforces worker check permissions and sends out-of-range check alert to admin", () => {
    const outOfScopePlan = getSnapshot().plans.find((plan) => {
      const eq = getSnapshot().equipment.find((candidate) => candidate.id === plan.equipmentId);
      return eq !== undefined && eq.displayCode.endsWith("/W");
    });
    expect(outOfScopePlan).toBeDefined();

    expect(switchRole("PRACOWNIK")).toBe(true);
    const workerSnap = getSnapshot();
    const tempPlan = workerSnap.plans.find((plan) => plan.canWrite && plan.id === "cp-thermo");
    expect(tempPlan).toBeDefined();

    const checkRes = recordCheck({
      planId: tempPlan!.id,
      values: { temp: "25,5", humidity: "48" },
      note: "Przekroczenie w pracowni",
    });
    expect(checkRes.ok).toBe(true);
    if (checkRes.ok) {
      expect(checkRes.data.outOfRange).toBe(true);
    }

    const forbiddenCal = recordCalibration({
      equipmentId: tempPlan!.equipmentId,
      calibratedMonth: "2026-11",
      vendor: "Testo",
      certificateNo: "X/1",
      adjustments: "",
      result: "OK",
      note: "",
      reviewPeriodFrom: null,
      reviewPeriodTo: null,
      points: [{ point: "20 °C", error: "0,1", uncertainty: "0,1", unit: "°C" }],
    });
    expect(forbiddenCal.ok).toBe(false);
    if (!forbiddenCal.ok) {
      expect(forbiddenCal.error.error).toBe("FORBIDDEN");
    }

    const scopeBlocked = recordCheck({
      planId: outOfScopePlan!.id,
      values: { force: "100", note: "" },
      note: "",
    });
    expect(scopeBlocked.ok).toBe(false);
    if (!scopeBlocked.ok) {
      expect(scopeBlocked.error.error).toBe("LAB_OUT_OF_SCOPE");
    }

    switchRole("ADMIN");
    const adminNotifications = getSnapshot().notifications;
    const alert = adminNotifications.find(
      (item) => item.kind === "CHECK_OUT_OF_RANGE" && item.readAt === null,
    );
    expect(alert).toBeDefined();
    expect(markAllNotificationsRead()).toBeGreaterThan(0);
    expect(getSnapshot().notifications.every((item) => item.readAt !== null)).toBe(true);
  });

  it("marks reagent low stock and alerts admin after worker stock count", () => {
    switchRole("PRACOWNIK");
    const reagent = getSnapshot().reagents.find(
      (candidate) => candidate.canWriteStock && candidate.status !== "LOW",
    );
    expect(reagent).toBeDefined();

    const countRes = recordStockCount({ reagentId: reagent!.id, quantity: "0,5" });
    expect(countRes.ok).toBe(true);

    const afterWorker = getSnapshot().reagents.find((candidate) => candidate.id === reagent!.id);
    expect(afterWorker?.status).toBe("LOW");

    switchRole("ADMIN");
    const lowAlert = getSnapshot().notifications.find(
      (item) => item.kind === "LOW_STOCK" && item.refId === reagent!.id && item.readAt === null,
    );
    expect(lowAlert).toBeDefined();
  });

  it("validates cement range bounds with Polish decimals, blocks strict parameters, and rejects invalid numbers", () => {
    switchRole("PRACOWNIK");
    const params = getSnapshot().parameters;
    const so3 = params.find((param) => param.name.includes("SO"));
    const cl = params.find((param) => param.name.includes("Cl"));
    expect(so3).toBeDefined();
    expect(cl).toBeDefined();

    const flagged = addTestResult({
      parameterId: so3!.id,
      equipmentId: "eq-balance",
      sampleLabel: "CEM-I-01",
      value: "3,35",
      repeatOfId: null,
    });
    expect(flagged.ok).toBe(true);
    if (flagged.ok) {
      expect(flagged.data.inRange).toBe(false);
      expect(flagged.data.minSnapshot).toBe("0.10");
      expect(flagged.data.maxSnapshot).toBe("3.20");
    }

    const blocked = addTestResult({
      parameterId: cl!.id,
      equipmentId: "eq-balance",
      sampleLabel: "CEM-I-02",
      value: "0,150",
      repeatOfId: null,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.error).toBe("OUT_OF_RANGE");
    }

    const invalid = addTestResult({
      parameterId: so3!.id,
      equipmentId: "eq-balance",
      sampleLabel: "CEM-I-03",
      value: "1,2,3",
      repeatOfId: null,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.error).toBe("INVALID_NUMBER");
    }

    switchRole("ADMIN");
    expect(
      getSnapshot().notifications.some(
        (item) => item.kind === "RESULT_OUT_OF_RANGE" && item.readAt === null,
      ),
    ).toBe(true);
  });

  it("delivers generated reports to manager inbox while keeping manager read-only", () => {
    const labA = getSnapshot().labs.find((lab) => lab.code === "A");
    expect(labA).toBeDefined();

    const created = generateReport({
      periodFrom: "2026-11-01",
      periodTo: "2026-11-27",
      labIds: [labA!.id],
    });
    expect(created.ok).toBe(true);

    switchRole("KIEROWNIK");
    const managerSnap = getSnapshot();
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(managerSnap.reports.some((rep) => rep.id === created.data.id)).toBe(true);
      expect(
        managerSnap.notifications.some(
          (note) => note.kind === "REPORT_READY" && note.refId === created.data.id,
        ),
      ).toBe(true);
    }

    const forbiddenReport = generateReport({
      periodFrom: "2026-11-01",
      periodTo: "2026-11-27",
      labIds: [labA!.id],
    });
    expect(forbiddenReport.ok).toBe(false);
    if (!forbiddenReport.ok) {
      expect(forbiddenReport.error.error).toBe("FORBIDDEN");
    }
  });
});
