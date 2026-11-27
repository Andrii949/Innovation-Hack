import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { addTestResult } from "@/api/demoClient";
import type { Snapshot } from "@/api/types";
import { ComboboxField, type ComboboxOption } from "@/components/ComboboxField";
import { FormField } from "@/components/FormField";
import { SelectField, type SelectOption } from "@/components/SelectField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate, formatDecimal, formatRange } from "@/lib/format";

export function ResultEntryForm({ snapshot }: { snapshot: Snapshot }) {
  const [parameterId, setParameterId] = useState(snapshot.parameters[0]?.id ?? "");
  const [equipmentId, setEquipmentId] = useState(
    snapshot.equipment.find((item) => item.withdrawnAt === null)?.id ?? "",
  );
  const [sampleLabel, setSampleLabel] = useState("");
  const [value, setValue] = useState("");
  const [repeatOfId, setRepeatOfId] = useState("none");

  const parameter =
    snapshot.parameters.find((candidate) => candidate.id === parameterId) ??
    snapshot.parameters[0] ??
    null;

  const parameterOptions = useMemo<ComboboxOption[]>(
    () =>
      snapshot.parameters.map((candidate) => ({
        value: candidate.id,
        label: `${candidate.name}${candidate.unit === "" ? "" : ` [${candidate.unit}]`}`,
        hint: candidate.material,
      })),
    [snapshot.parameters],
  );

  const equipmentOptions = useMemo<ComboboxOption[]>(
    () =>
      snapshot.equipment
        .filter((candidate) => candidate.withdrawnAt === null)
        .map((candidate) => ({
          value: candidate.id,
          label: `${candidate.displayCode} · ${candidate.name}`,
          hint: `${candidate.labName} · ${candidate.model}`,
        })),
    [snapshot.equipment],
  );

  const pendingRepeats = useMemo(
    () =>
      snapshot.results.filter(
        (result) =>
          result.parameterId === parameter?.id && !result.inRange && result.repeat === null,
      ),
    [snapshot.results, parameter?.id],
  );

  const repeatOptions = useMemo<SelectOption[]>(
    () => [
      { value: "none", label: "Nie dotyczy" },
      ...pendingRepeats.map((result) => ({
        value: result.id,
        label: `${result.sampleLabel} · ${formatDecimal(result.value)} ${result.unit} · ${formatDate(result.sampledAt)}`,
      })),
    ],
    [pendingRepeats],
  );

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (parameter === null) {
      return;
    }
    const response = addTestResult({
      parameterId: parameter.id,
      equipmentId: equipmentId === "" ? null : equipmentId,
      sampleLabel,
      value,
      repeatOfId: repeatOfId === "none" ? null : repeatOfId,
    });
    if (!response.ok) {
      toast.error("Wynik nie został zapisany", { description: response.error.message });
      return;
    }
    if (response.data.inRange) {
      toast.success("Wynik zapisany w zakresie", { description: sampleLabel });
    } else {
      toast.warning("Wynik poza zakresem", {
        description: "Wymagane powtórzenie badania — wynik trafił do kolejki kierownika.",
      });
    }
    setSampleLabel("");
    setValue("");
    setRepeatOfId("none");
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="result-parameter" label="Parametr" hint="Szukaj po nazwie lub materiale.">
            <ComboboxField
              id="result-parameter"
              value={parameter?.id ?? ""}
              options={parameterOptions}
              onValueChange={(nextParameterId) => {
                setParameterId(nextParameterId);
                setRepeatOfId("none");
              }}
              placeholder="Wybierz parametr"
              searchPlaceholder="Nazwa parametru lub materiał…"
              emptyText="Brak parametrów."
              ariaLabel="Parametr"
            />
          </FormField>
          <FormField id="result-sample" label="Oznaczenie próbki">
            <Input
              id="result-sample"
              placeholder="C-26/199"
              value={sampleLabel}
              required
              onChange={(event) => {
                setSampleLabel(event.target.value);
              }}
            />
          </FormField>
          <FormField
            id="result-equipment"
            label="Urządzenie pomiarowe"
            hint="Ślad weryfikacji po wzorcowaniu NIE OK."
          >
            <ComboboxField
              id="result-equipment"
              value={equipmentId}
              options={equipmentOptions}
              onValueChange={setEquipmentId}
              placeholder="Wybierz urządzenie"
              searchPlaceholder="Kod, nazwa lub model…"
              emptyText="Brak urządzeń w zakresie pracowni."
              ariaLabel="Urządzenie pomiarowe"
            />
          </FormField>
          <FormField
            id="result-value"
            label={`Wynik ${parameter === null ? "" : `[${parameter.unit}]`}`}
          >
            <Input
              id="result-value"
              inputMode="decimal"
              placeholder="np. 3,15"
              value={value}
              required
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
          </FormField>
          <FormField
            id="result-repeat"
            label="Powtórzenie wyniku (opcjonalnie)"
            hint="Wybierz wynik poza zakresem, który powtarzasz."
          >
            <SelectField
              id="result-repeat"
              value={repeatOfId}
              options={repeatOptions}
              onValueChange={setRepeatOfId}
              ariaLabel="Powtórzenie wyniku"
            />
          </FormField>
        </div>

        {parameter !== null && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Zakres: {formatRange(parameter.minValue, parameter.maxValue, parameter.unit)}
            </span>
            <Badge variant="secondary">
              {parameter.outOfRangeAction === "BLOCK"
                ? "poza zakresem: blokada zapisu"
                : "poza zakresem: oznaczenie i powtórzenie"}
            </Badge>
            <span>
              {parameter.accredited ? "badanie akredytowane" : "badanie nieakredytowane"} ·{" "}
              {parameter.method}
            </span>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={parameter === null || !parameter.active}>
            Zapisz wynik
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
