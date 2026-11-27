/** Formatting only. Deadlines come from the API; nothing here decides a status. */

import type { DueItem, IsoDate } from "@/api/types";

import { formatMonth } from "./months";

export function formatDate(date: IsoDate): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

export function formatDateTime(timestamp: string): string {
  return `${formatDate(timestamp.slice(0, 10))} ${timestamp.slice(11, 16)}`;
}

export function formatDecimal(value: string): string {
  return value.replace(".", ",");
}

export function formatRange(min: string | null, max: string | null, unit: string): string {
  if (min === null && max === null) {
    return "bez zakresu";
  }
  return `${min === null ? "—" : formatDecimal(min)}–${max === null ? "—" : formatDecimal(max)} ${unit}`.trim();
}

export function formatDue(item: DueItem): string {
  if (item.validUntil === null) {
    return "brak terminu";
  }
  if (item.kind === "CALIBRATION" || item.kind === "CHECK") {
    return formatMonth(item.validUntil.slice(0, 7));
  }
  return formatDate(item.validUntil);
}
