/** Presentation mapping for status codes. The code itself comes from the API. */

import type { DueKind, Status } from "@/api/types";
import { DUE_KINDS } from "@/api/types";

export type StatusColor = "success" | "warning" | "error" | "default";

const LABELS: Record<Status, string> = {
  OK: "Ważne",
  DUE_SOON: "Zbliża się termin",
  OVERDUE: "Po terminie",
  NO_DATA: "Brak danych",
  WITHDRAWN: "Wycofane",
  NOT_REQUIRED: "Bez wzorcowania",
  LOW: "Mało",
  COUNT_DUE: "Zrób spis",
};

const COLORS: Record<Status, StatusColor> = {
  OK: "success",
  DUE_SOON: "warning",
  OVERDUE: "error",
  NO_DATA: "error",
  WITHDRAWN: "default",
  NOT_REQUIRED: "default",
  LOW: "error",
  COUNT_DUE: "warning",
};

const DOT_CLASSES: Record<StatusColor, string> = {
  success: "bg-status-ok",
  warning: "bg-status-due",
  error: "bg-status-alarm",
  default: "bg-status-idle",
};

const BADGE_CLASSES: Record<StatusColor, string> = {
  success: "border-status-ok/60 bg-status-ok-soft text-status-ok-ink",
  warning: "border-status-due/70 bg-status-due-soft text-status-due-ink",
  error: "border-status-alarm/35 bg-status-alarm-soft text-status-alarm-ink",
  default: "border-border bg-status-idle-soft text-status-idle-ink",
};

const KIND_LABELS: Record<DueKind, string> = {
  CALIBRATION: "Wzorcowanie",
  CHECK: "Sprawdzenie",
  LOT_EXPIRY: "Ważność partii",
  LOW_STOCK: "Niski stan",
  STOCK_COUNT: "Spis stanu",
};

/** Sort order for status columns: what needs attention first. */
const SEVERITY: Record<Status, number> = {
  OVERDUE: 0,
  NO_DATA: 1,
  LOW: 2,
  DUE_SOON: 3,
  COUNT_DUE: 4,
  OK: 5,
  WITHDRAWN: 6,
  NOT_REQUIRED: 7,
};

export function isStatus(value: string): value is Status {
  return Object.hasOwn(LABELS, value);
}

export function statusSeverity(status: Status): number {
  return SEVERITY[status];
}

export function statusLabel(status: Status): string {
  return LABELS[status];
}

export function statusColor(status: Status): StatusColor {
  return COLORS[status];
}

export function statusBadgeClass(status: Status): string {
  return BADGE_CLASSES[statusColor(status)];
}

export function statusDotClass(status: Status): string {
  return DOT_CLASSES[statusColor(status)];
}

export function dueKindLabel(kind: DueKind): string {
  return KIND_LABELS[kind];
}

const DUE_KIND_SET: ReadonlySet<string> = new Set(DUE_KINDS);

export function isDueKind(value: string): value is DueKind {
  return DUE_KIND_SET.has(value);
}
