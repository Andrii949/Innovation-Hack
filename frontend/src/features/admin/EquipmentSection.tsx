import { cn } from "cn";

import type { EquipmentView, Snapshot } from "@/api/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatDecimal, formatDue } from "@/lib/format";
import { formatMonth } from "@/lib/months";

import { CalibrationForm } from "./CalibrationForm";

const MODE_LABEL = {
  EXTERNAL: "zewnętrzne",
  ON_SITE: "na miejscu",
} as const;

function nextDueLabel(equipment: EquipmentView): string {
  if (equipment.status === "WITHDRAWN") {
    return "Wycofane";
  }
  if (equipment.status === "NOT_REQUIRED") {
    return "Bez wzorcowania";
  }
  if (equipment.status === "NO_DATA" || equipment.nextDue === null) {
    return "Brak wpisu";
  }
  return formatDue(equipment.nextDue);
}

export function EquipmentSection({
  snapshot,
  selectedId,
  onSelectId,
}: {
  snapshot: Snapshot;
  selectedId: string | null;
  onSelectId: (equipmentId: string) => void;
}) {
  const selected =
    snapshot.equipment.find((equipment) => equipment.id === selectedId) ??
    snapshot.equipment[0] ??
    null;
  const plans =
    selected === null ? [] : snapshot.plans.filter((plan) => plan.equipmentId === selected.id);

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kod</TableHead>
              <TableHead>Nazwa</TableHead>
              <TableHead>Pracownia</TableHead>
              <TableHead>Ostatnie wzorcowanie</TableHead>
              <TableHead>Następny termin</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.equipment.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Brak urządzeń w zakresie pracowni.
                </TableCell>
              </TableRow>
            )}
            {snapshot.equipment.map((equipment) => (
              <TableRow
                key={equipment.id}
                className={cn(
                  equipment.id === selected?.id && "bg-accent/70",
                  equipment.status === "WITHDRAWN" && "opacity-60",
                )}
              >
                <TableCell>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 font-mono"
                    onClick={() => {
                      onSelectId(equipment.id);
                    }}
                  >
                    {equipment.displayCode}
                  </Button>
                </TableCell>
                <TableCell className="font-medium">{equipment.name}</TableCell>
                <TableCell className="whitespace-nowrap">{equipment.labName}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {equipment.lastCalibration === null
                    ? "—"
                    : formatMonth(equipment.lastCalibration.calibratedMonth)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{nextDueLabel(equipment)}</TableCell>
                <TableCell>
                  <StatusBadge status={equipment.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected !== null && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{selected.displayCode}</p>
              <h3 className="text-lg font-semibold tracking-tight">{selected.name}</h3>
              <p className="text-sm text-muted-foreground">
                {selected.manufacturer} {selected.model} · nr {selected.serialNo}
              </p>
            </div>
            <StatusBadge status={selected.status} />
          </div>

          <div className="p-4">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                  Pracownia
                </dt>
                <dd>{selected.labName}</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                  Lokalizacja
                </dt>
                <dd>{selected.location}</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                  Interwał / tryb
                </dt>
                <dd>
                  {selected.calibrationIntervalMonths === null
                    ? "—"
                    : `${selected.calibrationIntervalMonths} mies.`}{" "}
                  · {MODE_LABEL[selected.calibrationMode]}
                  {selected.calibrationRequired
                    ? `, wyprzedzenie ${selected.leadMonths} mies.`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                  Kryteria akceptacji
                </dt>
                <dd>{selected.acceptanceCriteria}</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                  Oprogramowanie
                </dt>
                <dd>{selected.softwareVersion ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                  Upoważnieni do sprawdzeń
                </dt>
                <dd className="flex flex-wrap gap-1 pt-0.5">
                  {selected.authorizedUsers.length === 0 ? (
                    <span className="text-muted-foreground">Brak listy — wpisuje biuro</span>
                  ) : (
                    selected.authorizedUsers.map((user) => (
                      <Badge key={user.id} variant="secondary">
                        {user.fullName}
                      </Badge>
                    ))
                  )}
                </dd>
              </div>
            </dl>

            {selected.withdrawnReason !== null && (
              <p className="mt-3 rounded-lg border border-amber-600/30 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                Wycofane {formatDate(selected.withdrawnAt ?? "")}: {selected.withdrawnReason}
              </p>
            )}

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold">Historia wzorcowań</h4>
                <div className="rounded-lg border">
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
                      {selected.calibrations.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-4 text-center text-muted-foreground">
                            Brak wpisów wzorcowania.
                          </TableCell>
                        </TableRow>
                      )}
                      {selected.calibrations.map((calibration) => (
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

            {selected.canWriteCalibration ? (
              <div className="mt-5">
                <CalibrationForm equipment={selected} />
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">
                Wpisy wzorcowań należą do uprawnień biura (`calibration:write`).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
