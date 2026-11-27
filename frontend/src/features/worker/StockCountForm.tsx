import { Beaker } from "lucide-react";
import type { SyntheticEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { recordStockCount } from "@/api/demoClient";
import type { ReagentView } from "@/api/types";
import { ComboboxField, type ComboboxOption } from "@/components/ComboboxField";
import { FormField } from "@/components/FormField";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatDecimal } from "@/lib/format";

function StockFields({ reagent }: { reagent: ReagentView }) {
  const [quantity, setQuantity] = useState("");

  const stock = Number(reagent.stock);
  const minimum = Number(reagent.minStock);
  const level =
    Number.isFinite(stock) && Number.isFinite(minimum) && minimum > 0
      ? Math.min(100, Math.round((stock / minimum) * 100))
      : 100;

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const response = recordStockCount({ reagentId: reagent.id, quantity });
    if (!response.ok) {
      toast.error("Spis nie został zapisany", { description: response.error.message });
      return;
    }
    toast.success("Spis zapisany", { description: `${reagent.name}: stan i status przeliczone.` });
    setQuantity("");
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Stan bieżący</p>
          <p className="font-semibold tabular-nums">
            {formatDecimal(reagent.stock)} {reagent.unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Próg minimalny</p>
          <p className="tabular-nums">
            {formatDecimal(reagent.minStock)} {reagent.unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ostatni spis</p>
          <p className="tabular-nums">
            {reagent.lastCount === null
              ? "Brak"
              : `${formatDate(reagent.lastCount.countedOn)} · ${formatDecimal(reagent.lastCount.quantity)} ${reagent.unit}`}
          </p>
        </div>
        <div className="grid gap-1 sm:col-span-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Stan względem progu</span>
            <span className="tabular-nums">{level}%</span>
          </div>
          <Progress value={level} aria-label="Stan względem progu minimalnego" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <FormField id="stock-quantity" label={`Nowy stan (${reagent.unit})`}>
          <Input
            id="stock-quantity"
            inputMode="decimal"
            placeholder="np. 750"
            value={quantity}
            required
            className="w-40"
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
          />
        </FormField>
        <Button type="submit">Zapisz spis</Button>
        <StatusBadge status={reagent.status} className="mb-1" />
      </div>
    </form>
  );
}

export function StockCountForm({
  reagents,
  reagentId,
  onReagentChange,
}: {
  reagents: ReagentView[];
  reagentId: string | null;
  onReagentChange: (reagentId: string) => void;
}) {
  const writable = useMemo(() => reagents.filter((reagent) => reagent.canWriteStock), [reagents]);
  const reagentOptions = useMemo<ComboboxOption[]>(
    () =>
      writable.map((candidate) => ({
        value: candidate.id,
        label: candidate.name,
        hint: `${candidate.labName} · ${candidate.unit}`,
      })),
    [writable],
  );
  const effectiveId = reagentId ?? writable[0]?.id ?? "";
  const reagent = writable.find((candidate) => candidate.id === effectiveId) ?? writable[0] ?? null;

  return (
    <div className="grid gap-3">
      <FormField id="stock-reagent" label="Odczynnik" hint="Szukaj po nazwie lub pracowni.">
        <ComboboxField
          id="stock-reagent"
          value={reagent?.id ?? ""}
          options={reagentOptions}
          onValueChange={onReagentChange}
          placeholder="Wybierz odczynnik"
          searchPlaceholder="Nazwa, pracownia lub jednostka…"
          emptyText="Brak odczynników do spisu."
          ariaLabel="Odczynnik"
          disabled={reagentOptions.length === 0}
        />
      </FormField>
      {reagent === null ? (
        <Empty className="border py-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Beaker aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Brak odczynników</EmptyTitle>
            <EmptyDescription>Brak odczynników w Twoich pracowniach.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <StockFields key={reagent.id} reagent={reagent} />
      )}
    </div>
  );
}
