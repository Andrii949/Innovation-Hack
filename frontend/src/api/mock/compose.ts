/**
 * Composes API-shaped responses from the mock database. This is the only place that turns stored
 * rows into statuses, due dates, stock levels and per-equipment `canWrite*` flags — exactly what
 * the FastAPI service will do. Views must consume these results as-is.
 */

import type {
  Calibration,
  CheckPlanView,
  CheckRecord,
  DueItem,
  EquipmentView,
  IsoDate,
  ReagentView,
  ReportSummary,
  ReportView,
  Session,
  Snapshot,
  Status,
  StockCount,
  TestResultView,
} from "@/api/types";

import { activeUser, userHasPermission, userLabIds } from "./access";
import { addDecimals, compareDecimals, subtractDecimals } from "./decimal";
import { calibrationWindow, checkWindow, expiryWindow, stockCountWindow } from "./due";
import type { MockDb } from "./types";

function labNameOf(db: MockDb, labId: string): string {
  return db.labs.find((lab) => lab.id === labId)?.name ?? labId;
}

function displayCodeOf(db: MockDb, labId: string, number: string): string {
  const code = db.labs.find((lab) => lab.id === labId)?.code ?? labId;
  return `${number}/${code}`;
}

function latestCalibrationOf(db: MockDb, equipmentId: string): Calibration | null {
  let latest: Calibration | null = null;
  for (const calibration of db.calibrations) {
    if (
      calibration.equipmentId === equipmentId &&
      (latest === null || calibration.calibratedMonth > latest.calibratedMonth)
    ) {
      latest = calibration;
    }
  }
  return latest;
}

function latestCheckRecordOf(db: MockDb, planId: string): CheckRecord | null {
  let latest: CheckRecord | null = null;
  for (const record of db.checkRecords) {
    if (
      record.checkPlanId === planId &&
      (latest === null || record.performedOn > latest.performedOn)
    ) {
      latest = record;
    }
  }
  return latest;
}

function lastCountOf(db: MockDb, reagentId: string) {
  let latest = null;
  for (const count of db.stockCounts) {
    if (count.reagentId === reagentId && (latest === null || count.countedOn > latest.countedOn)) {
      latest = count;
    }
  }
  return latest;
}

export function sessionFor(db: MockDb): Session {
  const user = activeUser(db);
  const role = db.roles.find((candidate) => candidate.code === user.roleCode);
  if (!role) {
    throw new Error(`Role not found: ${user.roleCode}`);
  }
  return {
    user: { id: user.id, login: user.login, fullName: user.fullName },
    role: { code: role.code, name: role.name },
    permissions: [...role.permissions],
    labIds: userLabIds(db, user),
    allLabs: user.labIds === "ALL",
    authorizedEquipmentIds: [...user.authorizedEquipmentIds],
  };
}

export function equipmentStatus(db: MockDb, equipmentId: string): Status {
  const equipment = db.equipment.find((candidate) => candidate.id === equipmentId);
  if (!equipment) {
    return "NO_DATA";
  }
  if (equipment.withdrawnAt !== null) {
    return "WITHDRAWN";
  }
  if (!equipment.calibrationRequired) {
    return "NOT_REQUIRED";
  }
  const calibration = latestCalibrationOf(db, equipment.id);
  if (!calibration) {
    return "NO_DATA";
  }
  return calibrationWindow(
    calibration.calibratedMonth,
    equipment.calibrationIntervalMonths ?? 12,
    equipment.leadMonths,
    db.today,
  ).status;
}

function calibrationDueItem(db: MockDb, equipmentId: string): DueItem | null {
  const equipment = db.equipment.find((candidate) => candidate.id === equipmentId);
  if (
    !equipment ||
    equipment.withdrawnAt !== null ||
    !equipment.calibrationRequired ||
    equipment.calibrationIntervalMonths === null
  ) {
    return null;
  }
  const label = `${displayCodeOf(db, equipment.labId, equipment.number)} · ${equipment.name}`;
  const calibration = latestCalibrationOf(db, equipment.id);
  if (!calibration) {
    return {
      id: `CALIBRATION:${equipment.id}`,
      kind: "CALIBRATION",
      refType: "EQUIPMENT",
      refId: equipment.id,
      labId: equipment.labId,
      labName: labNameOf(db, equipment.labId),
      label,
      equipmentId: equipment.id,
      due: db.today,
      alertFrom: db.today,
      validUntil: db.today,
      status: "NO_DATA",
    };
  }
  const window = calibrationWindow(
    calibration.calibratedMonth,
    equipment.calibrationIntervalMonths,
    equipment.leadMonths,
    db.today,
  );
  return {
    id: `CALIBRATION:${equipment.id}`,
    kind: "CALIBRATION",
    refType: "EQUIPMENT",
    refId: equipment.id,
    labId: equipment.labId,
    labName: labNameOf(db, equipment.labId),
    label,
    equipmentId: equipment.id,
    due: window.due,
    alertFrom: window.alertFrom,
    validUntil: window.validUntil,
    status: window.status,
  };
}

function checkDueItem(db: MockDb, planId: string): DueItem | null {
  const plan = db.plans.find((candidate) => candidate.id === planId);
  if (!plan || !plan.active) {
    return null;
  }
  const equipment = db.equipment.find((candidate) => candidate.id === plan.equipmentId);
  if (!equipment || equipment.withdrawnAt !== null) {
    return null;
  }
  const record = latestCheckRecordOf(db, plan.id);
  const base = {
    id: `CHECK:${plan.id}`,
    kind: "CHECK" as const,
    refType: "CHECK_PLAN" as const,
    refId: plan.id,
    labId: equipment.labId,
    labName: labNameOf(db, equipment.labId),
    label: `${displayCodeOf(db, equipment.labId, equipment.number)} · ${plan.name}`,
    equipmentId: equipment.id,
  };
  if (!record) {
    return {
      ...base,
      due: db.today,
      alertFrom: db.today,
      validUntil: db.today,
      status: "NO_DATA",
    };
  }
  const window = checkWindow(record.performedOn, plan.intervalMonths, plan.leadMonths, db.today);
  return { ...base, ...window };
}

export type ReagentStock = {
  stock: string;
  low: boolean;
  lastCount: StockCount | null;
  lastMovementOn: IsoDate | null;
  nearestLot: ReagentView["nearestLot"];
  expiryStatus: Status | null;
  status: Status;
};

export function reagentStock(db: MockDb, reagentId: string): ReagentStock {
  const reagent = db.reagents.find((candidate) => candidate.id === reagentId);
  if (!reagent) {
    return {
      stock: "0",
      low: false,
      lastCount: null,
      lastMovementOn: null,
      nearestLot: null,
      expiryStatus: null,
      status: "NOT_REQUIRED",
    };
  }

  const lastCount = lastCountOf(db, reagentId);
  const baseline = lastCount?.quantity ?? "0";
  let stock = baseline;
  let lastMovementOn = lastCount?.countedOn ?? null;

  for (const lot of db.lots) {
    if (lot.reagentId !== reagentId) {
      continue;
    }
    const receivedAfterCount = lastCount === null || lot.receivedOn > lastCount.countedOn;
    const disposedAfterCount =
      lot.disposedOn !== null && (lastCount === null || lot.disposedOn > lastCount.countedOn);
    if (receivedAfterCount) {
      stock = addDecimals(stock, lot.quantity);
      if (lastMovementOn === null || lot.receivedOn > lastMovementOn) {
        lastMovementOn = lot.receivedOn;
      }
    }
    if (disposedAfterCount && lot.disposedOn !== null) {
      stock = subtractDecimals(stock, lot.quantity);
      if (lastMovementOn === null || lot.disposedOn > lastMovementOn) {
        lastMovementOn = lot.disposedOn;
      }
    }
  }

  let nearestLot: ReagentView["nearestLot"] = null;
  for (const lot of db.lots) {
    if (
      lot.reagentId === reagentId &&
      lot.disposedOn === null &&
      (nearestLot === null || lot.expiryDate < nearestLot.expiryDate)
    ) {
      nearestLot = lot;
    }
  }

  const low = compareDecimals(stock, reagent.minStock) < 0;
  const expiryStatus = nearestLot
    ? expiryWindow(nearestLot.expiryDate, reagent.expiryLeadMonths, db.today).status
    : null;
  const status: Status = low
    ? "LOW"
    : expiryStatus !== null && expiryStatus !== "OK"
      ? expiryStatus
      : "OK";

  return { stock, low, lastCount, lastMovementOn, nearestLot, expiryStatus, status };
}

function dueItemsForReagents(db: MockDb): DueItem[] {
  const items: DueItem[] = [];
  for (const reagent of db.reagents) {
    if (!reagent.active) {
      continue;
    }
    const stock = reagentStock(db, reagent.id);
    if (stock.low && stock.lastMovementOn !== null) {
      items.push({
        id: `LOW_STOCK:${reagent.id}`,
        kind: "LOW_STOCK",
        refType: "REAGENT",
        refId: reagent.id,
        labId: reagent.labId,
        labName: labNameOf(db, reagent.labId),
        label: `${reagent.name} · stan ${stock.stock} ${reagent.unit} / próg ${reagent.minStock}`,
        equipmentId: null,
        due: stock.lastMovementOn,
        alertFrom: stock.lastMovementOn,
        validUntil: stock.lastMovementOn,
        status: "LOW",
      });
    }
    const countWindow = stockCountWindow(
      stock.lastCount?.countedOn ?? null,
      reagent.stockCountIntervalDays,
      db.today,
    );
    if (countWindow.status === "COUNT_DUE") {
      items.push({
        id: `STOCK_COUNT:${reagent.id}`,
        kind: "STOCK_COUNT",
        refType: "REAGENT",
        refId: reagent.id,
        labId: reagent.labId,
        labName: labNameOf(db, reagent.labId),
        label: `Spis stanu: ${reagent.name}`,
        equipmentId: null,
        due: countWindow.due,
        alertFrom: countWindow.due,
        validUntil: countWindow.due,
        status: "COUNT_DUE",
      });
    }
  }
  return items;
}

function dueItemsForLots(db: MockDb): DueItem[] {
  const items: DueItem[] = [];
  for (const lot of db.lots) {
    if (lot.disposedOn !== null) {
      continue;
    }
    const reagent = db.reagents.find((candidate) => candidate.id === lot.reagentId);
    if (!reagent || !reagent.active) {
      continue;
    }
    const window = expiryWindow(lot.expiryDate, reagent.expiryLeadMonths, db.today);
    items.push({
      id: `LOT_EXPIRY:${lot.id}`,
      kind: "LOT_EXPIRY",
      refType: "REAGENT_LOT",
      refId: lot.id,
      labId: reagent.labId,
      labName: labNameOf(db, reagent.labId),
      label: `${reagent.name} · partia ${lot.lotNo}`,
      equipmentId: null,
      due: window.due,
      alertFrom: window.alertFrom,
      validUntil: window.validUntil,
      status: window.status,
    });
  }
  return items;
}

export function computeDueItems(db: MockDb): DueItem[] {
  const items: DueItem[] = [];
  for (const equipment of db.equipment) {
    const item = calibrationDueItem(db, equipment.id);
    if (item) {
      items.push(item);
    }
  }
  for (const plan of db.plans) {
    const item = checkDueItem(db, plan.id);
    if (item) {
      items.push(item);
    }
  }
  items.push(...dueItemsForLots(db), ...dueItemsForReagents(db));
  return items;
}

const STATUS_ORDER: Record<Status, number> = {
  OVERDUE: 0,
  NO_DATA: 1,
  LOW: 2,
  DUE_SOON: 3,
  COUNT_DUE: 4,
  OK: 5,
  WITHDRAWN: 6,
  NOT_REQUIRED: 7,
};

export function sortDueItems(items: DueItem[]): DueItem[] {
  return items.toSorted((left, right) => {
    const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    return byStatus !== 0 ? byStatus : left.validUntil.localeCompare(right.validUntil);
  });
}

function buildEquipmentViews(db: MockDb, session: Session): EquipmentView[] {
  const views: EquipmentView[] = [];
  for (const equipment of db.equipment) {
    if (!session.labIds.includes(equipment.labId)) {
      continue;
    }
    const calibrations = db.calibrations
      .filter((calibration) => calibration.equipmentId === equipment.id)
      .toSorted((left, right) => right.calibratedMonth.localeCompare(left.calibratedMonth));
    const calibration = calibrations[0] ?? null;
    const authorizedUsers = db.users
      .filter((user) => user.authorizedEquipmentIds.includes(equipment.id))
      .map((user) => ({ id: user.id, fullName: user.fullName }));
    const canWriteCheck =
      equipment.withdrawnAt === null &&
      session.permissions.includes("check:write") &&
      (session.permissions.includes("equipment:write") ||
        session.authorizedEquipmentIds.includes(equipment.id));
    views.push({
      ...equipment,
      labName: labNameOf(db, equipment.labId),
      displayCode: displayCodeOf(db, equipment.labId, equipment.number),
      status: equipmentStatus(db, equipment.id),
      calibrations,
      lastCalibration: calibration,
      nextDue: calibrationDueItem(db, equipment.id),
      authorizedUsers,
      canWriteCalibration: session.permissions.includes("calibration:write"),
      canWriteCheck,
    });
  }
  return views;
}

function buildCheckPlanViews(db: MockDb, equipment: EquipmentView[]): CheckPlanView[] {
  const views: CheckPlanView[] = [];
  for (const plan of db.plans) {
    const equipmentView = equipment.find((candidate) => candidate.id === plan.equipmentId);
    if (!equipmentView) {
      continue;
    }
    const template = db.templates.find((candidate) => candidate.id === plan.formTemplateId);
    if (!template) {
      continue;
    }
    views.push({
      ...plan,
      equipmentName: `${equipmentView.displayCode} · ${equipmentView.name}`,
      template,
      lastRecord: latestCheckRecordOf(db, plan.id),
      nextDue: checkDueItem(db, plan.id),
      canWrite: equipmentView.canWriteCheck,
    });
  }
  return views;
}

function buildReagentViews(db: MockDb, session: Session): ReagentView[] {
  const views: ReagentView[] = [];
  for (const reagent of db.reagents) {
    if (!session.labIds.includes(reagent.labId)) {
      continue;
    }
    const stock = reagentStock(db, reagent.id);
    views.push({
      ...reagent,
      labName: labNameOf(db, reagent.labId),
      stock: stock.stock,
      lastCount: stock.lastCount,
      lastMovementOn: stock.lastMovementOn,
      nearestLot: stock.nearestLot,
      expiryStatus: stock.expiryStatus,
      status: stock.status,
      canWriteStock:
        session.permissions.includes("stock:write") && session.labIds.includes(reagent.labId),
    });
  }
  return views;
}

function buildResultViews(db: MockDb): TestResultView[] {
  const views: TestResultView[] = [];
  for (const result of db.results) {
    const parameter = db.parameters.find((candidate) => candidate.id === result.parameterId);
    if (!parameter) {
      continue;
    }
    const repeat = db.results.find((candidate) => candidate.repeatOfId === result.id) ?? null;
    views.push({
      ...result,
      parameterName: parameter.name,
      unit: parameter.unit,
      repeat,
    });
  }
  return views.toSorted((left, right) => right.sampledAt.localeCompare(left.sampledAt));
}

function buildReportViews(db: MockDb): ReportView[] {
  return db.reports
    .map((report) => ({
      ...report,
      createdByName: db.users.find((user) => user.id === report.createdBy)?.fullName ?? "—",
      acknowledgedByName:
        db.users.find((user) => user.id === report.acknowledgedByUserId)?.fullName ?? null,
      status: report.acknowledgedAt === null ? ("SENT" as const) : ("ACKNOWLEDGED" as const),
    }))
    .toSorted((left, right) => right.sentAt.localeCompare(left.sentAt));
}

export function buildReportSummary(
  db: MockDb,
  from: IsoDate,
  to: IsoDate,
  labIds: string[],
): ReportSummary {
  const due = computeDueItems(db).filter((item) => labIds.includes(item.labId));
  const equipmentIds = new Set(
    db.equipment.filter((item) => labIds.includes(item.labId)).map((item) => item.id),
  );
  const checksInPeriod = db.checkRecords.filter((record) => {
    const plan = db.plans.find((candidate) => candidate.id === record.checkPlanId);
    const equipment = db.equipment.find((candidate) => candidate.id === plan?.equipmentId);
    return (
      equipment !== undefined &&
      equipmentIds.has(equipment.id) &&
      record.performedOn >= from &&
      record.performedOn <= to
    );
  });
  const resultsInPeriod = db.results.filter(
    (result) => result.sampledAt >= from && result.sampledAt <= to,
  );
  const outOfRange = db.results.filter((result) => !result.inRange);
  const repeatPending = outOfRange.filter(
    (result) => !db.results.some((candidate) => candidate.repeatOfId === result.id),
  );

  return {
    equipment: equipmentIds.size,
    overdue: due.filter((item) => item.status === "OVERDUE").length,
    dueSoon: due.filter((item) => item.status === "DUE_SOON").length,
    lowStock: due.filter((item) => item.status === "LOW").length,
    checksInPeriod: checksInPeriod.length,
    checksOutOfRange: checksInPeriod.filter((record) => record.outOfRange).length,
    resultsInPeriod: resultsInPeriod.length,
    resultsOutOfRange: outOfRange.filter(
      (result) => result.sampledAt >= from && result.sampledAt <= to,
    ).length,
    repeatPending: repeatPending.length,
  };
}

export function buildSnapshot(db: MockDb): Snapshot {
  const session = sessionFor(db);
  const user = activeUser(db);
  const equipment = buildEquipmentViews(db, session);
  const schedule = sortDueItems(
    computeDueItems(db).filter((item) => session.labIds.includes(item.labId)),
  );
  const results = buildResultViews(db);
  const canReadAudit = userHasPermission(db, user, "audit:read");
  const canReadReports = userHasPermission(db, user, "report:read");
  const canReadReagents = userHasPermission(db, user, "reagent:read");

  return {
    today: db.today,
    session,
    demoRoles: db.roles.map((row) => ({ code: row.code, name: row.name })),
    labs: db.labs.filter((lab) => session.labIds.includes(lab.id)),
    schedule,
    equipment,
    plans: buildCheckPlanViews(db, equipment),
    templates: db.templates,
    results: session.permissions.includes("result:read") ? results : [],
    parameters: db.parameters.filter((parameter) => parameter.active),
    reagents: canReadReagents ? buildReagentViews(db, session) : [],
    reports: canReadReports ? buildReportViews(db) : [],
    notifications: db.notifications
      .filter(
        (notification) =>
          notification.userId === session.user.id && notification.resolvedAt === null,
      )
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)),
    audit: canReadAudit ? db.audit.toSorted((left, right) => right.at.localeCompare(left.at)) : [],
  };
}
