/**
 * The frontend's only data seam. Today it talks to the in-memory mock backend; when the FastAPI
 * service lands, this file becomes thin `fetch` calls with the same signatures. Permissions,
 * statuses and `canWrite*` flags remain server-owned either way.
 */

import type {
  ApiResult,
  Calibration,
  CheckRecord,
  Report,
  Snapshot,
  StockCount,
  TestResult,
} from "@/api/types";

import {
  acknowledgeReport as mockAcknowledgeReport,
  addTestResult as mockAddTestResult,
  type CalibrationInput,
  type CheckInput,
  generateReport as mockGenerateReport,
  markNotificationsRead as mockMarkNotificationsRead,
  recordCalibration as mockRecordCalibration,
  recordCheck as mockRecordCheck,
  recordStockCount as mockRecordStockCount,
  type ReportInput,
  signInAs,
  type StockCountInput,
  type TestResultInput,
} from "./mock/actions";
import { buildSnapshot } from "./mock/compose";
import { db, persistDb, resetDb } from "./mock/db";

const listeners = new Set<() => void>();
let cachedSnapshot: Snapshot | null = null;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): Snapshot {
  cachedSnapshot ??= buildSnapshot(db);
  return cachedSnapshot;
}

function invalidate(): void {
  cachedSnapshot = null;
  persistDb();
  for (const listener of listeners) {
    listener();
  }
}

function commit<T>(action: () => ApiResult<T>): ApiResult<T> {
  const result = action();
  if (result.ok) {
    invalidate();
  }
  return result;
}

export function switchRole(roleCode: string): boolean {
  const changed = signInAs(db, roleCode);
  if (changed) {
    invalidate();
  }
  return changed;
}

export function resetDemo(): void {
  resetDb();
  invalidate();
}

export function markAllNotificationsRead(): number {
  const count = mockMarkNotificationsRead(db);
  invalidate();
  return count;
}

export function recordCalibration(input: CalibrationInput): ApiResult<Calibration> {
  return commit(() => mockRecordCalibration(db, input));
}

export function recordCheck(input: CheckInput): ApiResult<CheckRecord> {
  return commit(() => mockRecordCheck(db, input));
}

export function recordStockCount(input: StockCountInput): ApiResult<StockCount> {
  return commit(() => mockRecordStockCount(db, input));
}

export function addTestResult(input: TestResultInput): ApiResult<TestResult> {
  return commit(() => mockAddTestResult(db, input));
}

export function acknowledgeReport(reportId: string): ApiResult<Report> {
  return commit(() => mockAcknowledgeReport(db, reportId));
}

export function generateReport(input: ReportInput): ApiResult<Report> {
  return commit(() => mockGenerateReport(db, input));
}
