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
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  default: "bg-muted-foreground/50",
};

const BADGE_CLASSES: Record<StatusColor, string> = {
  success:
    "border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning:
    "border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  error: "border-red-600/25 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  default: "border-border bg-muted text-muted-foreground",
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
