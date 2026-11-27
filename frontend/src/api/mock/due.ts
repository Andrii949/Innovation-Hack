/**
 * Deadline rules from docs/02 §4.1. Mock-backend only: the production FastAPI service computes
 * these (decision D5) and serves them as `DueItem.status`.
 */

import type { IsoDate, IsoMonth, Status } from "@/api/types";

import {
  addDays,
  addMonths,
  addMonthsToDateClamped,
  firstOfMonth,
  lastOfMonth,
  monthOf,
} from "./dates";

export type DueWindow = {
  due: IsoDate;
  alertFrom: IsoDate;
  validUntil: IsoDate;
};

export type DatedWindow = DueWindow & { status: Status };

export function statusForWindow(alertFrom: IsoDate, validUntil: IsoDate, today: IsoDate): Status {
  if (today < alertFrom) {
    return "OK";
  }
  if (today <= validUntil) {
    return "DUE_SOON";
  }
  return "OVERDUE";
}

/** Calibration: due month = certificate month + interval; alert = first day of due month - lead. */
export function calibrationWindow(
  calibratedMonth: IsoMonth,
  intervalMonths: number,
  leadMonths: number,
  today: IsoDate,
): DatedWindow {
  const dueMonth = addMonths(calibratedMonth, intervalMonths);
  const window = {
    due: firstOfMonth(dueMonth),
    alertFrom: firstOfMonth(addMonths(dueMonth, -leadMonths)),
    validUntil: lastOfMonth(dueMonth),
  };
  return { ...window, status: statusForWindow(window.alertFrom, window.validUntil, today) };
}

/** Check: due month = month of the last record + interval; same alert rule. */
export function checkWindow(
  lastPerformedOn: IsoDate,
  intervalMonths: number,
  leadMonths: number,
  today: IsoDate,
): DatedWindow {
  return calibrationWindow(monthOf(lastPerformedOn), intervalMonths, leadMonths, today);
}

/** Lot expiry: alerts start `leadMonths` before the expiry date, day clamped to month end. */
export function expiryWindow(expiryDate: IsoDate, leadMonths: number, today: IsoDate): DatedWindow {
  const alertFrom = addMonthsToDateClamped(expiryDate, -leadMonths);
  return {
    due: expiryDate,
    alertFrom,
    validUntil: expiryDate,
    status: statusForWindow(alertFrom, expiryDate, today),
  };
}

/** Stock count is due when the last count is older than the configured interval. */
export function stockCountWindow(
  lastCountedOn: IsoDate | null,
  intervalDays: number,
  today: IsoDate,
): { due: IsoDate; status: Status } {
  const due = lastCountedOn === null ? today : addDays(lastCountedOn, intervalDays);
  return { due, status: lastCountedOn === null || today > due ? "COUNT_DUE" : "OK" };
}
