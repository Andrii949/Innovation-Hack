import { CalendarClock, Check, TriangleAlert } from "lucide-react";
import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { approveCalibrationPlan, saveCalibrationPlan } from "@/api/demoClient";
import type {
  CalibrationPlan,
  CalibrationPlanAvailability,
  CalibrationPlanView,
  Snapshot,
} from "@/api/types";
import { ComboboxField, type ComboboxOption } from "@/components/ComboboxField";
import { FormField } from "@/components/FormField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { computeAvailability } from "@/lib/availability";
import { formatDate } from "@/lib/format";

function labCodeFor(snapshot: Snapshot, labId: string): string {
  return snapshot.labs.find((lab) => lab.id === labId)?.code ?? labId;
}

function candidatePlan(
  snapshot: Snapshot,
  equipmentId: string,
  dispatchDate: string,
  returnDate: string,
  planId: string | null = null,
): CalibrationPlan | null {
  const equipment = snapshot.equipment.find((item) => item.id === equipmentId);
  if (!equipment || dispatchDate === "" || returnDate === "" || dispatchDate > returnDate) {
    return null;
  }
  return {
    id: planId ?? "__preview__",
    equipmentId: equipment.id,
    labId: equipment.labId,
    dispatchDate,
    returnDate,
    status: "PENDING",
    note: "",
    createdBy: snapshot.session.user.id,
    createdAt: snapshot.today,
    approvedBy: null,
    approvedAt: null,
  };
}

function previewFor(
  snapshot: Snapshot,
  equipmentId: string,
  dispatchDate: string,
  returnDate: string,
  planId: string | null = null,
): CalibrationPlanAvailability | null {
  const plan = candidatePlan(snapshot, equipmentId, dispatchDate, returnDate, planId);
  if (plan === null) {
    return null;
  }
  return computeAvailability(snapshot.equipment, snapshot.calibrationPlans, plan, (labId) =>
    labCodeFor(snapshot, labId),
  );
}

function AvailabilityNotice({
  availability,
}: {
  availability: CalibrationPlanAvailability | null;
}) {
  if (availability === null) {
    return <p className="text-xs text-muted-foreground">Podaj poprawne daty wysyłki i zwrotu.</p>;
  }
  if (availability.minimum <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Urządzenie nie ma zdefiniowanej grupy zamiennej — kontrola dostępności nie dotyczy.
      </p>
    );
  }
  if (availability.warning === null) {
    return (
      <div className="rounded-lg border border-emerald-600/25 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <p className="flex items-center gap-1.5 font-medium">
          <Check className="size-3.5" aria-hidden />
          Dostępność zachowana
        </p>
        <p className="mt-0.5 tabular-nums">
          Najmniej dostępnych w okresie: {availability.available}. Minimum: {availability.minimum}.
          Dni bez wymaganego zapasu: {availability.daysWithout}.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-600/30 bg-red-50 px-3 py-2 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-200">
      <p className="flex items-start gap-1.5 font-medium">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {availability.warning}
      </p>
      <p className="mt-1 tabular-nums">
        Dni bez wymaganego zapasu: {availability.daysWithout}. Najmniej dostępnych w okresie:{" "}
        {availability.available}.
      </p>
      {availability.conflicts.length > 0 && (
        <p className="mt-1">
          Nakłada się z:{" "}
          {availability.conflicts
            .map(
              (conflict) =>
                `${conflict.displayCode} (${formatDate(conflict.dispatchDate)}–${formatDate(conflict.returnDate)})`,
            )
            .join(", ")}
          .
        </p>
      )}
    </div>
  );
}

function StatusBadge({ plan }: { plan: CalibrationPlanView }) {
  if (plan.status === "APPROVED") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        Zatwierdzony
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      Oczekuje na zatwierdzenie
    </Badge>
  );
}

function PlanRow({ snapshot, plan }: { snapshot: Snapshot; plan: CalibrationPlanView }) {
  const [dispatchDate, setDispatchDate] = useState(plan.dispatchDate);
  const [returnDate, setReturnDate] = useState(plan.returnDate);
  const [note, setNote] = useState(plan.note);
  const preview = useMemo(
    () => previewFor(snapshot, plan.equipmentId, dispatchDate, returnDate, plan.id),
    [snapshot, plan.equipmentId, plan.id, dispatchDate, returnDate],
  );
  const dirty =
    dispatchDate !== plan.dispatchDate || returnDate !== plan.returnDate || note !== plan.note;

  const save = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const response = saveCalibrationPlan({
      planId: plan.id,
      equipmentId: plan.equipmentId,
      dispatchDate,
      returnDate,
      note,
    });
    if (!response.ok) {
      toast.error("Plan nie został zapisany", { description: response.error.message });
      return;
    }
    const availability = preview;
    if (availability?.warning) {
      toast.warning("Plan zapisany z ostrzeżeniem", { description: availability.warning });
    } else {
      toast.success("Plan wysyłki zapisany", {
        description: `${plan.displayCode}: ${formatDate(dispatchDate)}–${formatDate(returnDate)}.`,
      });
    }
  };

  const approve = (): void => {
    const response = approveCalibrationPlan(plan.id);
    if (!response.ok) {
      toast.error("Plan nie został zatwierdzony", { description: response.error.message });
      return;
    }
    toast.success("Plan wzorcowania zatwierdzony", {
      description: `${plan.displayCode}: ${formatDate(plan.dispatchDate)}–${formatDate(plan.returnDate)}.`,
    });
  };

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground">{plan.displayCode}</p>
          <p className="text-sm font-semibold">{plan.equipmentName}</p>
          <p className="text-xs text-muted-foreground">
            {plan.labName} · plan utworzony przez {plan.createdByName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge plan={plan} />
          {plan.status === "APPROVED" && (
            <span className="text-[11px] text-muted-foreground">
              {plan.approvedByName ?? "—"}
              {plan.approvedAt === null ? "" : ` · ${formatDate(plan.approvedAt.slice(0, 10))}`}
            </span>
          )}
        </div>
      </div>

      {plan.canEdit ? (
        <form onSubmit={save} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField id={`plan-dispatch-${plan.id}`} label="Wysyłka do dostawcy">
              <Input
                id={`plan-dispatch-${plan.id}`}
                type="date"
                value={dispatchDate}
                required
                onChange={(event) => {
                  setDispatchDate(event.target.value);
                }}
              />
            </FormField>
            <FormField id={`plan-return-${plan.id}`} label="Planowany zwrot">
              <Input
                id={`plan-return-${plan.id}`}
                type="date"
                value={returnDate}
                required
                onChange={(event) => {
                  setReturnDate(event.target.value);
                }}
              />
            </FormField>
            <FormField id={`plan-note-${plan.id}`} label="Uwaga">
              <Textarea
                id={`plan-note-${plan.id}`}
                rows={1}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </FormField>
          </div>
          <AvailabilityNotice availability={preview} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {formatDate(dispatchDate)}–{formatDate(returnDate)}
            </p>
            <Button type="submit" size="sm" disabled={!dirty}>
              Zapisz zmiany
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Wysyłka: </span>
            {formatDate(plan.dispatchDate)}
          </p>
          <p>
            <span className="text-muted-foreground">Planowany zwrot: </span>
            {formatDate(plan.returnDate)}
          </p>
          {plan.note !== "" && (
            <p className="text-xs text-muted-foreground sm:col-span-2">{plan.note}</p>
          )}
        </div>
      )}

      {!plan.canEdit && <AvailabilityNotice availability={plan.availability} />}

      {plan.canApprove ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            Plan gotowy do zatwierdzenia przez kierownika.
          </p>
          <Button type="button" size="sm" onClick={approve}>
            <Check aria-hidden />
            Zatwierdź plan
          </Button>
        </div>
      ) : null}
      {plan.status === "PENDING" &&
        plan.availability.warning !== null &&
        snapshot.session.permissions.includes("calibration:approve") && (
          <p className="text-xs text-red-700 dark:text-red-400">
            Zatwierdzenie zablokowane do czasu usunięcia konfliktu dostępności.
          </p>
        )}
    </div>
  );
}

function NewPlanForm({ snapshot }: { snapshot: Snapshot }) {
  const options = useMemo<ComboboxOption[]>(
    () =>
      snapshot.equipment
        .filter(
          (equipment) =>
            equipment.calibrationMode === "EXTERNAL" &&
            equipment.calibrationRequired &&
            equipment.withdrawnAt === null,
        )
        .map((equipment) => ({
          value: equipment.id,
          label: `${equipment.displayCode} · ${equipment.name}`,
          hint: `${equipment.labName} · ${equipment.model}`,
        })),
    [snapshot.equipment],
  );
  const [equipmentId, setEquipmentId] = useState(options[0]?.value ?? "");
  const [dispatchDate, setDispatchDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [note, setNote] = useState("");
  const preview = previewFor(snapshot, equipmentId, dispatchDate, returnDate);

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (equipmentId === "") {
      toast.error("Wybierz urządzenie do wysyłki.");
      return;
    }
    const response = saveCalibrationPlan({ equipmentId, dispatchDate, returnDate, note });
    if (!response.ok) {
      toast.error("Plan nie został zapisany", { description: response.error.message });
      return;
    }
    if (preview?.warning) {
      toast.warning("Plan zapisany z ostrzeżeniem", { description: preview.warning });
    } else {
      toast.success("Plan wysyłki zapisany");
    }
    setDispatchDate("");
    setReturnDate("");
    setNote("");
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-3"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="size-4" aria-hidden />
        Zaplanuj wysyłkę do wzorcowania
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField
          id="new-plan-equipment"
          label="Urządzenie"
          hint="Tylko urządzenia wzorcowane na zewnątrz."
        >
          <ComboboxField
            id="new-plan-equipment"
            value={equipmentId}
            options={options}
            onValueChange={setEquipmentId}
            placeholder="Wybierz urządzenie"
            searchPlaceholder="Kod, nazwa lub model…"
            emptyText="Brak urządzeń do wysyłki."
            ariaLabel="Urządzenie do wysyłki"
          />
        </FormField>
        <FormField id="new-plan-dispatch" label="Wysyłka">
          <Input
            id="new-plan-dispatch"
            type="date"
            value={dispatchDate}
            required
            onChange={(event) => {
              setDispatchDate(event.target.value);
            }}
          />
        </FormField>
        <FormField id="new-plan-return" label="Planowany zwrot">
          <Input
            id="new-plan-return"
            type="date"
            value={returnDate}
            required
            onChange={(event) => {
              setReturnDate(event.target.value);
            }}
          />
        </FormField>
        <FormField id="new-plan-note" label="Uwaga">
          <Input
            id="new-plan-note"
            value={note}
            placeholder="np. kurier, numer zlecenia"
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </FormField>
      </div>
      <AvailabilityNotice availability={preview} />
      <div className="flex justify-end">
        <Button type="submit" size="sm">
          Zapisz plan
        </Button>
      </div>
    </form>
  );
}

/** Calibration dispatch plans with a lab-level interchangeability check and manager approval. */
export function CalibrationPlanPanel({ snapshot }: { snapshot: Snapshot }) {
  const canEdit = snapshot.session.permissions.includes("calibration:write");
  const plans = snapshot.calibrationPlans;

  return (
    <div className="grid gap-4">
      {canEdit && <NewPlanForm snapshot={snapshot} />}
      {plans.length === 0 ? (
        <p className="rounded-xl border px-3 py-6 text-center text-sm text-muted-foreground">
          Brak planów wzorcowania.
        </p>
      ) : (
        <div className="grid gap-3">
          {plans.map((plan) => (
            <PlanRow key={plan.id} snapshot={snapshot} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
