/**
 * Equipment availability across planned calibration absences. Pure input/output over equipment rows
 * and calibration plans so the mock backend and the live preview agree exactly.
 */

import { addDays } from "@/api/mock/dates";
import type {
  CalibrationPlan,
  CalibrationPlanAvailability,
  CalibrationPlanConflict,
  Equipment,
  IsoDate,
} from "@/api/types";

const GROUP_LABELS: Record<string, string> = {
  termohigrometr: "termohigrometru",
};

export function availabilityGroupLabel(group: string | null): string {
  return group === null ? "" : (GROUP_LABELS[group] ?? "urządzenia");
}

function overlaps(
  left: { dispatchDate: IsoDate; returnDate: IsoDate },
  right: { dispatchDate: IsoDate; returnDate: IsoDate },
): boolean {
  return left.dispatchDate <= right.returnDate && right.dispatchDate <= left.returnDate;
}

/**
 * Checks one planned absence against every other pending or approved plan in the same lab and the
 * same `availabilityGroup`. Dates are inclusive, so 07–14 and 14–17 overlap on the 14th.
 */
export function computeAvailability(
  equipment: Equipment[],
  plans: CalibrationPlan[],
  plan: CalibrationPlan,
  labCodeFor: (labId: string) => string = () => "",
): CalibrationPlanAvailability {
  const source = equipment.find((item) => item.id === plan.equipmentId) ?? null;
  const group = source?.availabilityGroup ?? null;
  const minimum = source?.minimumAvailable ?? 0;
  const groupDevices =
    group === null
      ? []
      : equipment.filter(
          (item) =>
            item.labId === plan.labId &&
            item.availabilityGroup === group &&
            item.withdrawnAt === null,
        );

  if (group === null || minimum <= 0) {
    return {
      groupLabel: availabilityGroupLabel(group),
      minimum,
      available: groupDevices.length,
      daysWithout: 0,
      conflicts: [],
      warning: null,
    };
  }

  const otherPlans = plans.filter((item) => item.id !== plan.id);
  const relevantPlans = otherPlans
    .filter((item) => groupDevices.some((device) => device.id === item.equipmentId))
    .filter((item) => overlaps(item, plan));
  const absences = [
    ...relevantPlans.map((item) => ({
      equipmentId: item.equipmentId,
      dispatchDate: item.dispatchDate,
      returnDate: item.returnDate,
    })),
    {
      equipmentId: plan.equipmentId,
      dispatchDate: plan.dispatchDate,
      returnDate: plan.returnDate,
    },
  ];

  let available = groupDevices.length;
  let daysWithout = 0;
  for (let date = plan.dispatchDate; date <= plan.returnDate; date = addDays(date, 1)) {
    const absent = new Set(
      absences
        .filter((item) => item.dispatchDate <= date && date <= item.returnDate)
        .map((item) => item.equipmentId),
    );
    const present = groupDevices.length - absent.size;
    available = Math.min(available, present);
    if (present < minimum) {
      daysWithout += 1;
    }
  }

  const conflicts: CalibrationPlanConflict[] = [];
  for (const item of relevantPlans) {
    const device = groupDevices.find((candidate) => candidate.id === item.equipmentId);
    if (device === undefined || conflicts.some((row) => row.planId === item.id)) {
      continue;
    }
    conflicts.push({
      planId: item.id,
      equipmentId: device.id,
      displayCode: `${device.number}/${labCodeFor(device.labId)}`,
      name: device.name,
      dispatchDate: item.dispatchDate,
      returnDate: item.returnDate,
    });
  }

  const groupLabel = availabilityGroupLabel(group);
  return {
    groupLabel,
    minimum,
    available,
    daysWithout,
    conflicts,
    warning:
      daysWithout > 0
        ? `W tym okresie nie będzie dostępnego ${groupLabel}. Wymagane minimum: ${minimum}.`
        : null,
  };
}

/** Counts the inclusive days between two ISO dates. */
export function countDays(from: IsoDate, to: IsoDate): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }
  return Math.round((end - start) / 86_400_000) + 1;
}
