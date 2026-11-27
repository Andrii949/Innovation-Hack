/**
 * Mock-backend writes. Every action re-checks permissions and lab scope, like FastAPI must; the
 * UI's hidden buttons are convenience, not enforcement.
 */

import type {
  ApiError,
  ApiResult,
  Calibration,
  CalibrationPoint,
  CalibrationResult,
  CheckRecord,
  ErrorCode,
  IsoDate,
  Notification,
  Report,
  StockCount,
  TestResult,
} from "@/api/types";

import {
  activeUser,
  canReceiveReports,
  userHasPermission,
  userLabIds,
  userPermissions,
} from "./access";
import { buildReportSummary, reagentStock } from "./compose";
import { addMonths, isIsoDate, parseMonth } from "./dates";
import { compareDecimals, isInRange, normalizeDecimal } from "./decimal";
import type { MockDb } from "./types";

export type CalibrationInput = {
  equipmentId: string;
  calibratedMonth: string;
  vendor: string;
  certificateNo: string;
  adjustments: string;
  result: CalibrationResult;
  note: string;
  points: CalibrationPoint[];
};

export type CheckInput = {
  planId: string;
  values: Record<string, string>;
  note: string;
};

export type StockCountInput = {
  reagentId: string;
  quantity: string;
};

export type TestResultInput = {
  parameterId: string;
  sampleLabel: string;
  value: string;
  repeatOfId: string | null;
};

export type ReportInput = {
  periodFrom: IsoDate;
  periodTo: IsoDate;
  labIds: string[];
};

type AuditInput = {
  action: "create" | "update" | "delete" | "reject" | "login";
  entity: string;
  entityId: string | null;
  before: string | null;
  after: string | null;
  reason?: string | null;
};

const plNumber = (value: string): string => value.replace(".", ",");

function afterNow(): string {
  return new Date().toISOString().slice(0, 19);
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function failure<T>(error: ErrorCode, message: string): ApiResult<T> {
  const body: ApiError = { error, message };
  return { ok: false, error: body };
}

function success<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

function appendAudit(db: MockDb, input: AuditInput): void {
  const user = activeUser(db);
  db.audit.push({
    id: newId("audit"),
    at: afterNow(),
    userId: user.id,
    userName: user.fullName,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    reason: input.reason ?? null,
  });
}

function notify(
  db: MockDb,
  userId: string,
  input: Omit<Notification, "id" | "userId" | "readAt" | "resolvedAt" | "createdAt">,
): void {
  if (db.notifications.some((row) => row.userId === userId && row.dedupeKey === input.dedupeKey)) {
    return;
  }
  db.notifications.push({
    ...input,
    id: newId("n"),
    userId,
    readAt: null,
    resolvedAt: null,
    createdAt: afterNow(),
  });
}

export function signInAs(db: MockDb, roleCode: string): boolean {
  const user = db.users.find((candidate) => candidate.roleCode === roleCode && candidate.active);
  if (!user) {
    return false;
  }
  db.activeUserId = user.id;
  return true;
}

function resolveNotifications(db: MockDb, matches: (notification: Notification) => boolean): void {
  const stamp = afterNow();
  for (const notification of db.notifications) {
    if (notification.resolvedAt === null && matches(notification)) {
      notification.resolvedAt = stamp;
    }
  }
}

export function markNotificationsRead(db: MockDb): number {
  const user = activeUser(db);
  const stamp = afterNow();
  let count = 0;
  for (const notification of db.notifications) {
    if (
      notification.userId === user.id &&
      notification.readAt === null &&
      notification.resolvedAt === null
    ) {
      notification.readAt = stamp;
      count += 1;
    }
  }
  return count;
}

export function recordCalibration(db: MockDb, input: CalibrationInput): ApiResult<Calibration> {
  const user = activeUser(db);
  if (!userHasPermission(db, user, "calibration:write")) {
    return failure("FORBIDDEN", "Brak uprawnień do wpisywania wzorcowań.");
  }
  const equipment = db.equipment.find((candidate) => candidate.id === input.equipmentId);
  if (!equipment) {
    return failure("NOT_FOUND", "Nie znaleziono urządzenia.");
  }
  if (!userLabIds(db, user).includes(equipment.labId)) {
    return failure("LAB_OUT_OF_SCOPE", "Pracownia spoza zakresu użytkownika.");
  }
  if (parseMonth(input.calibratedMonth) === null) {
    return failure("VALIDATION_ERROR", "Miesiąc wzorcowania musi mieć format RRRR-MM.");
  }
  if (input.certificateNo.trim() === "") {
    return failure("VALIDATION_ERROR", "Podaj numer świadectwa.");
  }
  if (input.result !== "OK" && input.result !== "NOK") {
    return failure("VALIDATION_ERROR", "Zaznacz wynik wzorcowania: OK albo NIE OK.");
  }
  for (const point of input.points) {
    if (normalizeDecimal(point.error) === null || normalizeDecimal(point.uncertainty) === null) {
      return failure("INVALID_NUMBER", "Błąd i niepewność punktu muszą być liczbami.");
    }
  }

  const calibration: Calibration = {
    id: newId("cal"),
    equipmentId: equipment.id,
    calibratedMonth: input.calibratedMonth,
    vendor: input.vendor.trim(),
    certificateNo: input.certificateNo.trim(),
    adjustments: input.adjustments.trim(),
    result: input.result,
    nextDueMonth:
      equipment.calibrationIntervalMonths === null
        ? null
        : addMonths(input.calibratedMonth, equipment.calibrationIntervalMonths),
    note: input.note.trim(),
    points: input.points.map((point) => ({
      ...point,
      error: normalizeDecimal(point.error) ?? point.error,
      uncertainty: normalizeDecimal(point.uncertainty) ?? point.uncertainty,
    })),
  };
  db.calibrations.push(calibration);
  resolveNotifications(
    db,
    (notification) =>
      notification.kind === "CALIBRATION_DUE" && notification.refId === equipment.id,
  );
  appendAudit(db, {
    action: "create",
    entity: "calibration",
    entityId: calibration.id,
    before: null,
    after: JSON.stringify({
      equipment: `${equipment.number}/${db.labs.find((lab) => lab.id === equipment.labId)?.code ?? ""}`,
      certificate: calibration.certificateNo,
      result: calibration.result,
    }),
  });
  return success(calibration);
}

export function recordCheck(db: MockDb, input: CheckInput): ApiResult<CheckRecord> {
  const user = activeUser(db);
  if (!userHasPermission(db, user, "check:write")) {
    return failure("FORBIDDEN", "Brak uprawnień do wpisywania sprawdzeń.");
  }
  const plan = db.plans.find((candidate) => candidate.id === input.planId);
  if (!plan) {
    return failure("NOT_FOUND", "Nie znaleziono planu sprawdzeń.");
  }
  const equipment = db.equipment.find((candidate) => candidate.id === plan.equipmentId);
  if (!equipment) {
    return failure("NOT_FOUND", "Nie znaleziono urządzenia.");
  }
  if (!userLabIds(db, user).includes(equipment.labId)) {
    return failure("LAB_OUT_OF_SCOPE", "Pracownia spoza zakresu użytkownika.");
  }
  if (equipment.withdrawnAt !== null) {
    return failure("EQUIPMENT_WITHDRAWN", "Urządzenie wycofane — wpisy zablokowane.");
  }
  const mayWrite =
    userHasPermission(db, user, "equipment:write") ||
    user.authorizedEquipmentIds.includes(equipment.id);
  if (!mayWrite) {
    return failure("NOT_AUTHORIZED_FOR_EQUIPMENT", "Brak uprawnień do wpisu dla tego urządzenia.");
  }
  const template = db.templates.find((candidate) => candidate.id === plan.formTemplateId);
  if (!template) {
    return failure("NOT_FOUND", "Nie znaleziono formularza sprawdzenia.");
  }

  const values: Record<string, string> = {};
  let outOfRange = false;
  for (const field of template.fields) {
    const raw = input.values[field.key] ?? "";
    if (field.required && raw.trim() === "") {
      return failure("VALIDATION_ERROR", `Uzupełnij pole: ${field.label}.`);
    }
    if (field.type === "number" && raw.trim() !== "") {
      const normalized = normalizeDecimal(raw);
      if (normalized === null) {
        return failure("INVALID_NUMBER", `Pole „${field.label}” nie jest liczbą.`);
      }
      values[field.key] = normalized;
      if (!isInRange(normalized, field.min, field.max)) {
        outOfRange = true;
      }
      continue;
    }
    if (field.type === "date" && raw.trim() !== "") {
      if (!isIsoDate(raw)) {
        return failure("VALIDATION_ERROR", `Pole „${field.label}” nie jest poprawną datą.`);
      }
    }
    values[field.key] = raw;
  }

  const record: CheckRecord = {
    id: newId("cr"),
    checkPlanId: plan.id,
    performedOn: db.today,
    values,
    outOfRange,
    performedBy: user.id,
    note: input.note.trim(),
  };
  db.checkRecords.push(record);
  resolveNotifications(
    db,
    (notification) => notification.kind === "CHECK_DUE" && notification.refId === plan.id,
  );
  appendAudit(db, {
    action: "create",
    entity: "check_record",
    entityId: record.id,
    before: null,
    after: JSON.stringify({ plan: plan.name, values: record.values, out_of_range: outOfRange }),
  });

  if (outOfRange) {
    const payload = {
      kind: "CHECK_OUT_OF_RANGE" as const,
      refType: "CHECK_RECORD",
      refId: record.id,
      title: "Sprawdzenie poza zakresem",
      body: `${equipment.number}/${db.labs.find((lab) => lab.id === equipment.labId)?.code ?? ""} · ${plan.name}: wpis poza zakresem.`,
      due: db.today,
      dedupeKey: `check:${record.id}`,
    };
    for (const admin of db.users) {
      if (
        admin.active &&
        userHasPermission(db, admin, "equipment:write") &&
        userLabIds(db, admin).includes(equipment.labId)
      ) {
        notify(db, admin.id, payload);
      }
    }
  }
  return success(record);
}

export function recordStockCount(db: MockDb, input: StockCountInput): ApiResult<StockCount> {
  const user = activeUser(db);
  if (!userHasPermission(db, user, "stock:write")) {
    return failure("FORBIDDEN", "Brak uprawnień do spisu stanu.");
  }
  const reagent = db.reagents.find((candidate) => candidate.id === input.reagentId);
  if (!reagent || !reagent.active) {
    return failure("NOT_FOUND", "Nie znaleziono odczynnika.");
  }
  if (!userLabIds(db, user).includes(reagent.labId)) {
    return failure("LAB_OUT_OF_SCOPE", "Pracownia spoza zakresu użytkownika.");
  }
  const quantity = normalizeDecimal(input.quantity);
  if (quantity === null || compareDecimals(quantity, "0") < 0) {
    return failure("INVALID_NUMBER", "Podaj nieujemną ilość.");
  }

  const count: StockCount = {
    id: newId("sc"),
    reagentId: reagent.id,
    quantity,
    countedOn: db.today,
    countedBy: user.id,
  };
  db.stockCounts.push(count);
  resolveNotifications(
    db,
    (notification) =>
      (notification.kind === "LOW_STOCK" || notification.kind === "STOCK_COUNT_DUE") &&
      notification.refId === reagent.id,
  );
  appendAudit(db, {
    action: "create",
    entity: "stock_count",
    entityId: count.id,
    before: null,
    after: JSON.stringify({ reagent: reagent.name, quantity }),
  });

  const stock = reagentStock(db, reagent.id);
  if (stock.low) {
    const payload = {
      kind: "LOW_STOCK" as const,
      refType: "REAGENT",
      refId: reagent.id,
      title: "Mało odczynnika",
      body: `${reagent.name}: stan ${stock.stock.replace(".", ",")} ${reagent.unit}, próg ${reagent.minStock.replace(".", ",")}.`,
      due: db.today,
      dedupeKey: `low:${reagent.id}:${db.today}`,
    };
    for (const admin of db.users) {
      if (
        admin.active &&
        userHasPermission(db, admin, "reagent:write") &&
        userLabIds(db, admin).includes(reagent.labId)
      ) {
        notify(db, admin.id, payload);
      }
    }
  }
  return success(count);
}

export function addTestResult(db: MockDb, input: TestResultInput): ApiResult<TestResult> {
  const user = activeUser(db);
  if (!userHasPermission(db, user, "result:write")) {
    return failure("FORBIDDEN", "Brak uprawnień do wpisywania wyników.");
  }
  const parameter = db.parameters.find(
    (candidate) => candidate.id === input.parameterId && candidate.active,
  );
  if (!parameter) {
    return failure("NOT_FOUND", "Nie znaleziono parametru badania.");
  }
  if (input.sampleLabel.trim() === "") {
    return failure("VALIDATION_ERROR", "Podaj oznaczenie próbki.");
  }
  const value = normalizeDecimal(input.value);
  if (value === null) {
    return failure("INVALID_NUMBER", "Nie można odczytać wyniku.");
  }
  const inRange = isInRange(value, parameter.minValue, parameter.maxValue);
  if (!inRange && parameter.outOfRangeAction === "BLOCK") {
    const range =
      parameter.minValue === null && parameter.maxValue === null
        ? "bez zakresu"
        : `${(parameter.minValue ?? "—").replace(".", ",")}–${(parameter.maxValue ?? "—").replace(".", ",")} ${parameter.unit}`;
    return {
      ok: false,
      error: {
        error: "OUT_OF_RANGE",
        message: `Wynik poza zakresem ${range}. Zapis zablokowany — powtórz badanie.`,
      },
    };
  }
  if (input.repeatOfId !== null) {
    const original = db.results.find((candidate) => candidate.id === input.repeatOfId);
    if (!original) {
      return failure("NOT_FOUND", "Nie znaleziono powtarzanego wyniku.");
    }
  }

  const result: TestResult = {
    id: newId("r"),
    parameterId: parameter.id,
    sampleLabel: input.sampleLabel.trim(),
    value,
    minSnapshot: parameter.minValue,
    maxSnapshot: parameter.maxValue,
    inRange,
    repeatOfId: input.repeatOfId,
    createdBy: user.id,
    sampledAt: db.today,
  };
  db.results.push(result);
  appendAudit(db, {
    action: "create",
    entity: "test_result",
    entityId: result.id,
    before: null,
    after: JSON.stringify({
      parameter: parameter.name,
      sample: result.sampleLabel,
      value,
      in_range: inRange,
    }),
  });

  if (!inRange) {
    const payload = {
      kind: "RESULT_OUT_OF_RANGE" as const,
      refType: "TEST_RESULT",
      refId: result.id,
      title: "Wynik poza zakresem",
      body: `${parameter.name}: ${plNumber(value)} ${parameter.unit} (${plNumber(parameter.minValue ?? "—")}–${plNumber(parameter.maxValue ?? "—")}). Wymagane powtórzenie.`,
      due: db.today,
      dedupeKey: `result:${result.id}`,
    };
    for (const reader of db.users) {
      if (
        reader.active &&
        userHasPermission(db, reader, "result:read") &&
        userHasPermission(db, reader, "equipment:write")
      ) {
        notify(db, reader.id, payload);
      }
    }
  }
  return success(result);
}

export function generateReport(db: MockDb, input: ReportInput): ApiResult<Report> {
  const user = activeUser(db);
  if (!userHasPermission(db, user, "report:write")) {
    return failure("FORBIDDEN", "Brak uprawnień do generowania i wysyłki raportu.");
  }
  if (
    !isIsoDate(input.periodFrom) ||
    !isIsoDate(input.periodTo) ||
    input.periodFrom > input.periodTo
  ) {
    return failure("VALIDATION_ERROR", "Zakres dat jest niepoprawny.");
  }
  const uniqueLabs = [...new Set(input.labIds)].filter((labId) =>
    userLabIds(db, user).includes(labId),
  );
  if (uniqueLabs.length === 0) {
    return failure("VALIDATION_ERROR", "Wybierz pracownię objętą raportem.");
  }

  const periodLabel = `${input.periodFrom.slice(8, 10)}.${input.periodFrom.slice(5, 7)}–${input.periodTo.slice(8, 10)}.${input.periodTo.slice(5, 7)}.${input.periodTo.slice(0, 4)}`;
  const report: Report = {
    id: newId("rep"),
    title: `Raport nadzoru — ${periodLabel}`,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    labIds: uniqueLabs,
    createdBy: user.id,
    createdAt: afterNow(),
    sentAt: afterNow(),
    summary: buildReportSummary(db, input.periodFrom, input.periodTo, uniqueLabs),
    notes: "Raport wygenerowany z bieżącego harmonogramu, spisów i wyników.",
  };
  db.reports.push(report);
  appendAudit(db, {
    action: "create",
    entity: "report",
    entityId: report.id,
    before: null,
    after: JSON.stringify({ title: report.title, labs: uniqueLabs }),
  });

  for (const reader of db.users) {
    if (reader.active && canReceiveReports(userPermissions(db, reader))) {
      notify(db, reader.id, {
        kind: "REPORT_READY",
        refType: "REPORT",
        refId: report.id,
        title: "Nowy raport dla kierownika",
        body: `${report.title} — wysłany przez ${user.fullName}.`,
        due: null,
        dedupeKey: `report:${report.id}`,
      });
    }
  }
  return success(report);
}
