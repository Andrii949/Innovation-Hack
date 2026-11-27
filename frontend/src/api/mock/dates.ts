/** Date and month arithmetic for the mock backend. ISO strings only, UTC, no local time zone. */

import type { IsoDate, IsoMonth } from "@/api/types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseMonth(ym: string): { year: number; month: number } | null {
  const match = MONTH_RE.exec(ym);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

export function isIsoDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function partsOf(date: IsoDate): { year: number; month: number; day: number } {
  const match = DATE_RE.exec(date);
  if (!match) {
    throw new Error(`Invalid date: ${date}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function addMonths(ym: IsoMonth, delta: number): IsoMonth {
  const parsed = parseMonth(ym);
  if (!parsed) {
    throw new Error(`Invalid month: ${ym}`);
  }
  const total = parsed.year * 12 + (parsed.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return `${pad(year, 4)}-${pad(month)}`;
}

export function firstOfMonth(ym: IsoMonth): IsoDate {
  return `${ym}-01`;
}

export function lastOfMonth(ym: IsoMonth): IsoDate {
  const parsed = parseMonth(ym);
  if (!parsed) {
    throw new Error(`Invalid month: ${ym}`);
  }
  return `${ym}-${pad(daysInMonth(parsed.year, parsed.month))}`;
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const parts = partsOf(date);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Month arithmetic that keeps the day when possible and clamps to the target month's end. */
export function addMonthsToDateClamped(date: IsoDate, delta: number): IsoDate {
  const parts = partsOf(date);
  const target = addMonths(monthOf(date), delta);
  const targetParts = parseMonth(target);
  if (!targetParts) {
    throw new Error(`Invalid month: ${target}`);
  }
  const day = Math.min(parts.day, daysInMonth(targetParts.year, targetParts.month));
  return `${target}-${pad(day)}`;
}
