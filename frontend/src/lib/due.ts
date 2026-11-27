/**
 * Joins the API's flat `DueItem` rows with the rest of the snapshot. The backend serves
 * `ref_type`/`ref_id`/`lab_id` only; equipment and lab labels come from those reads.
 */

import type { CheckPlan, DueItem, Lab } from "@/api/types";

export function dueKey(item: DueItem): string {
  return `${item.kind}:${item.refType}:${item.refId}`;
}

/** Equipment card behind a due item: calibrations point at it, checks at their plan. */
export function dueEquipmentId(item: DueItem, plans: CheckPlan[]): string | null {
  if (item.refType === "equipment") {
    return item.refId;
  }
  if (item.refType === "check_plan") {
    return plans.find((plan) => plan.id === item.refId)?.equipmentId ?? null;
  }
  return null;
}

export function dueLabName(item: DueItem, labs: Lab[]): string {
  return labs.find((lab) => lab.id === item.labId)?.name ?? "—";
}
