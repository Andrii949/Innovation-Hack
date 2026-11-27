import type { ReactNode } from "react";

import type { Snapshot } from "@/api/types";
import { DataList, DataListItem } from "@/components/DataList";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDecimal } from "@/lib/format";
import { formatMonth } from "@/lib/months";

import { CalibrationForm } from "./CalibrationForm";

const MODE_LABEL = {
  EXTERNAL: "zewnętrzne",
  ON_SITE: "na miejscu",
} as const;

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/** PN-EN ISO/IEC 17025 6.4.13 equipment card: identification, calibrations, checks, authorisations. */
export function EquipmentDetail({
  snapshot,
  equipmentId,
  onClose,
}: {
  snapshot: Snapshot;
  equipmentId: string | null;
  onClose: () => void;
}) {
  const equipment = snapshot.equipment.find((candidate) => candidate.id === equipmentId) ?? null;
  const plans =
    equipment === null ? [] : snapshot.plans.filter((plan) => plan.equipmentId === equipment.id);

  return (
    <Sheet
      open={equipment !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:w-full sm:data-[side=right]:max-w-3xl"
      >
        {equipment !== null && (
          <>
            <SheetHeader className="gap-1 border-b bg-muted/30 px-4 py-3 pr-12">
              <p className="font-mono text-xs text-muted-foreground">{equipment.displayCode}</p>
              <SheetTitle className="text-lg font-semibold tracking-tight">
                {equipment.name}
              </SheetTitle>
              <SheetDescription>
                {equipment.manufacturer} {equipment.model} · nr {equipment.serialNo}
              </SheetDescription>
              <div className="pt-1">
                <StatusBadge status={equipment.status} />
              </div>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 py-4">
                <dl className="grid gap-x-6 gap-y-3 pr-2 text-sm sm:grid-cols-2">
                  <MetaItem label="Pracownia">{equipment.labName}</MetaItem>
                  <MetaItem label="Lokalizacja">{equipment.location}</MetaItem>
                  <MetaItem label="Interwał / tryb">
                    {equipment.calibrationIntervalMonths === null
                      ? "—"
                      : `${equipment.calibrationIntervalMonths} mies.`}{" "}
                    · {MODE_LABEL[equipment.calibrationMode]}
                    {equipment.calibrationRequired
                      ? `, wyprzedzenie ${equipment.leadMonths} mies.`
                      : ""}
                  </MetaItem>
                  <MetaItem label="Kryteria akceptacji">{equipment.acceptanceCriteria}</MetaItem>
                  <MetaItem label="Oprogramowanie">{equipment.softwareVersion ?? "—"}</MetaItem>
                  <div className="sm:col-span-2">
                    <dt className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                      Upoważnieni do sprawdzeń
                    </dt>
                    <dd className="flex flex-wrap gap-1 pt-0.5">
                      {equipment.authorizedUsers.length === 0 ? (
                        <span className="text-muted-foreground">Brak listy — wpisuje biuro</span>
                      ) : (
                        equipment.authorizedUsers.map((user) => (
                          <Badge key={user.id} variant="secondary">
                            {user.fullName}
                          </Badge>
                        ))
                      )}
                    </dd>
                  </div>
                </dl>

                {equipment.withdrawnReason !== null && (
                  <p className="mt-3 rounded-lg border border-amber-600/30 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Wycofane {formatDate(equipment.withdrawnAt ?? "")}: {equipment.withdrawnReason}
                  </p>
                )}

                <div className="mt-5 grid gap-5">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Historia wzorcowań</h4>
                    <div className="sm:hidden">
                      <DataList>
                        {equipment.calibrations.length === 0 && (
                          <DataListItem className="text-sm text-muted-foreground">
                            Brak wpisów wzorcowania.
                          </DataListItem>
                        )}
                        {equipment.calibrations.map((calibration) => (
                          <DataListItem key={calibration.id}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium tabular-nums">
                                  {formatMonth(calibration.calibratedMonth)} ·{" "}
                                  {calibration.certificateNo}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {calibration.vendor}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                                  {calibration.points.length === 0
                                    ? "Brak punktów"
                                    : calibration.points
                                        .map(
                                          (point) =>
                                            `${point.point}: ${formatDecimal(point.error)} ± ${formatDecimal(point.uncertainty)} ${point.unit}`,
                                        )
                                        .join(" · ")}
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={
                                  calibration.result === "OK"
                                    ? "shrink-0 border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "shrink-0 border-red-600/25 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                                }
                              >
                                {calibration.result === "OK" ? "OK" : "NIE OK"}
                              </Badge>
                            </div>
                          </DataListItem>
                        ))}
                      </DataList>
                    </div>

                    <div className="hidden overflow-hidden rounded-lg border border-border/70 sm:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Miesiąc</TableHead>
                            <TableHead>Świadectwo</TableHead>
                            <TableHead>Wynik</TableHead>
                            <TableHead>Punkty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {equipment.calibrations.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="py-4 text-center text-muted-foreground"
                              >
                                Brak wpisów wzorcowania.
                              </TableCell>
                            </TableRow>
                          )}
                          {equipment.calibrations.map((calibration) => (
                            <TableRow key={calibration.id}>
                              <TableCell className="whitespace-nowrap">
                                {formatMonth(calibration.calibratedMonth)}
                              </TableCell>
                              <TableCell>
                                {calibration.certificateNo}
                                <span className="block text-xs text-muted-foreground">
                                  {calibration.vendor}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    calibration.result === "OK"
                                      ? "border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                      : "border-red-600/25 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                                  }
                                >
                                  {calibration.result === "OK" ? "OK" : "NIE OK"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {calibration.points.length === 0
                                  ? "—"
                                  : calibration.points
                                      .map(
                                        (point) =>
                                          `${point.point}: ${formatDecimal(point.error)} ± ${formatDecimal(point.uncertainty)} ${point.unit}`,
                                      )
                                      .join(" · ")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Plany sprawdzeń</h4>
                    <div className="grid gap-2">
                      {plans.length === 0 && (
                        <p className="rounded-lg border px-3 py-4 text-sm text-muted-foreground">
                          Brak planów sprawdzeń.
                        </p>
                      )}
                      {plans.map((plan) => (
                        <div
                          key={plan.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">{plan.name}</p>
                            <p className="text-xs text-muted-foreground">
                              co {plan.intervalMonths} mies. ·{" "}
                              {plan.lastRecord === null
                                ? "brak wpisów"
                                : `ostatnio ${formatDate(plan.lastRecord.performedOn)}`}
                              {plan.lastRecord?.outOfRange === true && " · poza zakresem"}
                            </p>
                          </div>
                          {plan.nextDue === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <StatusBadge status={plan.nextDue.status} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {equipment.canWriteCalibration ? (
                  <div className="mt-5">
                    <CalibrationForm equipment={equipment} />
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Wpisy wzorcowań należą do uprawnień biura (`calibration:write`).
                  </p>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
