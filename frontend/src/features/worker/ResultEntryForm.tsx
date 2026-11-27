import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";

import { addTestResult } from "@/api/demoClient";
import type { Snapshot } from "@/api/types";
import { FormField } from "@/components/FormField";
import { SelectField, type SelectOption } from "@/components/SelectField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate, formatDecimal, formatRange } from "@/lib/format";

export function ResultEntryForm({ snapshot }: { snapshot: Snapshot }) {
  const [parameterId, setParameterId] = useState(snapshot.parameters[0]?.id ?? "");
  const [sampleLabel, setSampleLabel] = useState("");
  const [value, setValue] = useState("");
  const [repeatOfId, setRepeatOfId] = useState("none");
  const [message, setMessage] = useState<{
    tone: "ok" | "warning" | "error";
    text: string;
  } | null>(null);

  const parameter =
    snapshot.parameters.find((candidate) => candidate.id === parameterId) ??
    snapshot.parameters[0] ??
    null;

  const parameterOptions = useMemo<SelectOption[]>(
    () =>
      snapshot.parameters.map((candidate) => ({
        value: candidate.id,
        label: `${candidate.name}${candidate.unit === "" ? "" : ` [${candidate.unit}]`}`,
      })),
    [snapshot.parameters],
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
      sampleLabel,
      value,
      repeatOfId: repeatOfId === "none" ? null : repeatOfId,
    });
    if (!response.ok) {
      setMessage({ tone: "error", text: response.error.message });
      return;
    }
    setMessage(
      response.data.inRange
        ? { tone: "ok", text: "Wynik zapisany w zakresie." }
        : {
            tone: "warning",
            text: "Wynik zapisany poza zakresem — wymagane powtórzenie badania.",
          },
    );
    setSampleLabel("");
    setValue("");
    setRepeatOfId("none");
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="result-parameter" label="Parametr">
            <SelectField
              id="result-parameter"
              value={parameter?.id ?? ""}
              options={parameterOptions}
              onValueChange={(nextParameterId) => {
                setParameterId(nextParameterId);
                setRepeatOfId("none");
              }}
              placeholder="Wybierz parametr"
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

        {message !== null && (
          <Alert variant={message.tone === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
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
