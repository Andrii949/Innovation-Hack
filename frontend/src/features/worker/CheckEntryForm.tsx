import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";

import { recordCheck } from "@/api/demoClient";
import type { CheckPlanView, FormField as FormFieldModel } from "@/api/types";
import { FormField } from "@/components/FormField";
import { SelectField, type SelectOption } from "@/components/SelectField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate, formatRange } from "@/lib/format";

type Message = { tone: "ok" | "warning" | "error"; text: string };

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldModel;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `check-field-${field.key}`;
  const hint =
    field.type === "number"
      ? `${formatRange(field.min, field.max, field.unit ?? "")}${field.required ? " · wymagane" : " · opcjonalne"}`
      : field.required
        ? "wymagane"
        : "opcjonalne";

  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {field.label}
        {field.unit !== null && field.type === "number" && (
          <span className="text-xs font-normal text-muted-foreground"> [{field.unit}]</span>
        )}
      </FieldLabel>
      {field.type === "bool" ? (
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id={id}
            checked={value === "true"}
            onCheckedChange={(checked) => {
              onChange(checked === true ? "true" : "false");
            }}
          />
          <span className="text-sm">Potwierdzam</span>
        </div>
      ) : (
        <Input
          id={id}
          type={field.type === "date" ? "date" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={value}
          required={field.required}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  );
}

function CheckFields({ plan }: { plan: CheckPlanView }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<Message | null>(null);

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const response = recordCheck({ planId: plan.id, values, note });
    if (!response.ok) {
      setMessage({ tone: "error", text: response.error.message });
      return;
    }
    setMessage(
      response.data.outOfRange
        ? {
            tone: "warning",
            text: "Sprawdzenie zapisane, ale wynik jest poza zakresem. Administrator dostał powiadomienie — powtórz pomiar.",
          }
        : { tone: "ok", text: "Sprawdzenie zapisane. Termin przeliczony z daty wpisu." },
    );
    setValues({});
    setNote("");
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {plan.template.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={values[field.key] ?? ""}
              onChange={(value) => {
                setValues((current) => ({ ...current, [field.key]: value }));
              }}
            />
          ))}
        </div>
        <FormField id="check-note" label="Uwagi">
          <Input
            id="check-note"
            value={note}
            placeholder="np. pomiar powtórzony po czyszczeniu"
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </FormField>
        {message !== null && (
          <Alert variant={message.tone === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={!plan.canWrite}>
            Zapisz sprawdzenie
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function CheckEntryForm({
  plans,
  equipmentId,
  onEquipmentChange,
}: {
  plans: CheckPlanView[];
  equipmentId: string | null;
  onEquipmentChange: (equipmentId: string) => void;
}) {
  const writablePlans = useMemo(() => plans.filter((plan) => plan.canWrite), [plans]);

  const equipmentOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = [];
    for (const plan of writablePlans) {
      if (!options.some((option) => option.value === plan.equipmentId)) {
        options.push({ value: plan.equipmentId, label: plan.equipmentName });
      }
    }
    return options;
  }, [writablePlans]);

  const effectiveEquipmentId = equipmentId ?? writablePlans[0]?.equipmentId ?? "";
  const plansForEquipment = useMemo(
    () => writablePlans.filter((plan) => plan.equipmentId === effectiveEquipmentId),
    [writablePlans, effectiveEquipmentId],
  );
  const planOptions = useMemo<SelectOption[]>(
    () => plansForEquipment.map((plan) => ({ value: plan.id, label: plan.name })),
    [plansForEquipment],
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const plan =
    plansForEquipment.find((candidate) => candidate.id === selectedPlanId) ??
    plansForEquipment[0] ??
    null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="check-equipment" label="Urządzenie">
          <SelectField
            id="check-equipment"
            value={effectiveEquipmentId}
            options={equipmentOptions}
            onValueChange={(value) => {
              setSelectedPlanId(null);
              onEquipmentChange(value);
            }}
            placeholder="Wybierz urządzenie"
            ariaLabel="Urządzenie"
            disabled={equipmentOptions.length === 0}
          />
        </FormField>
        {plansForEquipment.length > 1 && (
          <FormField id="check-plan" label="Plan sprawdzeń">
            <SelectField
              id="check-plan"
              value={plan?.id ?? ""}
              options={planOptions}
              onValueChange={(value) => {
                setSelectedPlanId(value);
              }}
              ariaLabel="Plan sprawdzeń"
            />
          </FormField>
        )}
      </div>

      {plan === null ? (
        <Alert>
          <AlertDescription>
            Brak planu sprawdzeń dla tego urządzenia albo brak uprawnień do wpisu.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">{plan.name}</p>
            <p className="text-xs text-muted-foreground">
              Co {plan.intervalMonths} mies.
              {plan.lastRecord !== null && ` · ostatnio ${formatDate(plan.lastRecord.performedOn)}`}
            </p>
          </div>
          <CheckFields key={plan.id} plan={plan} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Lista zawiera tylko urządzenia z listy upoważnionych. Uprawnienia sprawdza API — brak
        upoważnienia kończy się kodem `NOT_AUTHORIZED_FOR_EQUIPMENT`.
      </p>
    </div>
  );
}
