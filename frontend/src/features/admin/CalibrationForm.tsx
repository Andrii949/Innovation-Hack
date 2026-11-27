import type { SyntheticEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { recordCalibration } from "@/api/demoClient";
import type { CalibrationResult, EquipmentView } from "@/api/types";
import { FormField } from "@/components/FormField";
import { SelectField, type SelectOption } from "@/components/SelectField";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMonth, parseMonthInput } from "@/lib/months";

const RESULT_OPTIONS: SelectOption[] = [
  { value: "OK", label: "OK — zgodne" },
  { value: "NOK", label: "NIE OK — niezgodne" },
];

export function CalibrationForm({ equipment }: { equipment: EquipmentView }) {
  const [month, setMonth] = useState("");
  const [certificateNo, setCertificateNo] = useState("");
  const [vendor, setVendor] = useState("Laboratorium Wzorcujące Warta");
  const [adjustments, setAdjustments] = useState("Brak");
  const [result, setResult] = useState<CalibrationResult>("OK");
  const [note, setNote] = useState("");
  const [point, setPoint] = useState("");
  const [error, setError] = useState("");
  const [uncertainty, setUncertainty] = useState("");
  const [unit, setUnit] = useState("");

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const parsedMonth = parseMonthInput(month);
    if (parsedMonth === null) {
      toast.error("Nieprawidłowy miesiąc wzorcowania", {
        description: "Podaj miesiąc jako MM/RRRR, np. 11/2026.",
      });
      return;
    }
    const hasPoint = [point, error, uncertainty, unit].some((item) => item.trim() !== "");
    const response = recordCalibration({
      equipmentId: equipment.id,
      calibratedMonth: parsedMonth,
      vendor,
      certificateNo,
      adjustments,
      result,
      note,
      points: hasPoint ? [{ point, error, uncertainty, unit }] : [],
    });
    if (!response.ok) {
      toast.error("Wzorcowanie nie zostało zapisane", { description: response.error.message });
      return;
    }
    toast.success(`Zapisano wzorcowanie ${formatMonth(parsedMonth)}`, {
      description: `${equipment.displayCode}: termin i status przeliczone.`,
    });
    setCertificateNo("");
    setNote("");
    setPoint("");
    setError("");
    setUncertainty("");
    setUnit("");
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-3 text-sm font-semibold">Wpisz wynik wzorcowania</p>
      <form onSubmit={submit}>
        <FieldGroup className="gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              id={`cal-month-${equipment.id}`}
              label="Miesiąc ze świadectwa"
              hint="Format MM/RRRR, np. 11/2026."
            >
              <Input
                id={`cal-month-${equipment.id}`}
                placeholder="11/2026"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                }}
                required
              />
            </FormField>
            <FormField id={`cal-cert-${equipment.id}`} label="Nr świadectwa">
              <Input
                id={`cal-cert-${equipment.id}`}
                placeholder="LW/2026/0421"
                value={certificateNo}
                onChange={(event) => {
                  setCertificateNo(event.target.value);
                }}
                required
              />
            </FormField>
            <FormField id={`cal-vendor-${equipment.id}`} label="Firma wzorcująca">
              <Input
                id={`cal-vendor-${equipment.id}`}
                value={vendor}
                onChange={(event) => {
                  setVendor(event.target.value);
                }}
              />
            </FormField>
            <FormField id={`cal-result-${equipment.id}`} label="Decyzja">
              <SelectField
                id={`cal-result-${equipment.id}`}
                value={result}
                options={RESULT_OPTIONS}
                onValueChange={(value) => {
                  setResult(value === "NOK" ? "NOK" : "OK");
                }}
                ariaLabel="Decyzja"
              />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              id={`cal-point-${equipment.id}`}
              label="Punkt (opcjonalnie)"
              hint="Punkt, błąd i niepewność ze świadectwa."
            >
              <Input
                id={`cal-point-${equipment.id}`}
                placeholder="500 g"
                value={point}
                onChange={(event) => {
                  setPoint(event.target.value);
                }}
              />
            </FormField>
            <FormField id={`cal-error-${equipment.id}`} label="Błąd">
              <Input
                id={`cal-error-${equipment.id}`}
                inputMode="decimal"
                placeholder="0,2"
                value={error}
                onChange={(event) => {
                  setError(event.target.value);
                }}
              />
            </FormField>
            <FormField id={`cal-unc-${equipment.id}`} label="Niepewność">
              <Input
                id={`cal-unc-${equipment.id}`}
                inputMode="decimal"
                placeholder="0,1"
                value={uncertainty}
                onChange={(event) => {
                  setUncertainty(event.target.value);
                }}
              />
            </FormField>
            <FormField id={`cal-unit-${equipment.id}`} label="Jednostka">
              <Input
                id={`cal-unit-${equipment.id}`}
                placeholder="mg"
                value={unit}
                onChange={(event) => {
                  setUnit(event.target.value);
                }}
              />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id={`cal-adj-${equipment.id}`} label="Adiustacje">
              <Input
                id={`cal-adj-${equipment.id}`}
                value={adjustments}
                onChange={(event) => {
                  setAdjustments(event.target.value);
                }}
              />
            </FormField>
            <FormField id={`cal-note-${equipment.id}`} label="Uwagi">
              <Textarea
                id={`cal-note-${equipment.id}`}
                rows={2}
                value={note}
                placeholder="np. świadectwo wpisane z oryginału, bez OCR"
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </FormField>
          </div>

          <div className="flex justify-end">
            <Button type="submit">Zapisz wzorcowanie</Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}
