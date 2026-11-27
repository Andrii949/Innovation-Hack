import { Beaker, CircleAlert, ClipboardCheck, Gauge, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import type { Snapshot } from "@/api/types";
import { Metric, MetricStrip } from "@/components/MetricStrip";
import { PageHeader, PageMeta } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResultsTable } from "@/features/results/ResultsTable";
import { dueEquipmentId } from "@/lib/due";

import { CheckEntryForm } from "./CheckEntryForm";
import { MyTasks } from "./MyTasks";
import { ResultEntryForm } from "./ResultEntryForm";
import { StockCountForm } from "./StockCountForm";

export function WorkerPage({ snapshot }: { snapshot: Snapshot }) {
  const writablePlans = useMemo(
    () => snapshot.plans.filter((plan) => plan.canWrite),
    [snapshot.plans],
  );
  const writableEquipment = useMemo(
    () =>
      new Set(
        snapshot.equipment
          .filter((equipment) => equipment.canWriteCheck)
          .map((equipment) => equipment.id),
      ),
    [snapshot.equipment],
  );
  const writableReagents = useMemo(
    () =>
      new Set(
        snapshot.reagents.filter((reagent) => reagent.canWriteStock).map((reagent) => reagent.id),
      ),
    [snapshot.reagents],
  );

  const [equipmentId, setEquipmentId] = useState<string | null>(
    writablePlans[0]?.equipmentId ?? null,
  );
  const [reagentId, setReagentId] = useState<string | null>(
    snapshot.reagents.find((reagent) => reagent.canWriteStock)?.id ?? null,
  );
  const [checkOpen, setCheckOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  const tasks = useMemo(
    () =>
      snapshot.schedule.filter((item) => {
        if (item.status === "OK") {
          return false;
        }
        if (item.kind === "CHECK") {
          const planEquipmentId = dueEquipmentId(item, snapshot.plans);
          return planEquipmentId !== null && writableEquipment.has(planEquipmentId);
        }
        if (item.kind === "STOCK_COUNT" || item.kind === "LOW_STOCK") {
          return writableReagents.has(item.refId);
        }
        return false;
      }),
    [snapshot.schedule, snapshot.plans, writableEquipment, writableReagents],
  );
  const checkTasks = tasks.filter((task) => task.kind === "CHECK");
  const stockTasks = new Set(
    tasks
      .filter((task) => task.kind === "STOCK_COUNT" || task.kind === "LOW_STOCK")
      .map((task) => task.refId),
  );
  const repeatPending = snapshot.results.filter(
    (result) => !result.inRange && result.repeat === null,
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow="Pracownia · wpisy i spisy"
        title="Pracownia"
        description="Twoje zadania, sprawdzenia i spisy. Wpisy widoczne od razu w biurze; zakres uprawnień pochodzi z API."
        today={snapshot.today}
      >
        <PageMeta
          label="Zakres"
          value={snapshot.labs.map((lab) => `${lab.code} — ${lab.name}`).join(" · ")}
        />
        <PageMeta label="Uprawnienia" value={`${writableEquipment.size} urządzeń`} />
        <PageMeta
          label="Zadania"
          value={tasks.length}
          tone={tasks.length > 0 ? "alert" : "default"}
        />
      </PageHeader>

      <MetricStrip>
        <Metric
          label="Moje zadania"
          value={tasks.length}
          hint="sprawdzenia i spisy w terminie"
          tone={tasks.length > 0 ? "warning" : "success"}
          icon={ClipboardCheck}
        />
        <Metric
          label="Sprawdzenia"
          value={checkTasks.length}
          hint="urządzenia z Twojej listy"
          icon={Gauge}
        />
        <Metric
          label="Spisy do zrobienia"
          value={stockTasks.size}
          hint="odczynniki i CRM"
          icon={Beaker}
        />
        <Metric
          label="Wyniki do powtórzenia"
          value={repeatPending.length}
          hint="poza zakresem bez powtórzenia"
          tone={repeatPending.length > 0 ? "error" : "default"}
          icon={CircleAlert}
        />
      </MetricStrip>

      <Panel
        title="Moje zadania"
        description="Najbliższe sprawdzenia i spisy. Wpis otwiera się nad listą, bez przewijania strony."
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setCheckOpen(true);
            }}
          >
            <ClipboardCheck aria-hidden />
            Wpisz sprawdzenie
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setStockOpen(true);
            }}
          >
            <Plus aria-hidden />
            Wpisz spis
          </Button>
        </div>
        <MyTasks
          items={tasks}
          plans={snapshot.plans}
          onCheck={(selectedId) => {
            setEquipmentId(selectedId);
            setCheckOpen(true);
          }}
          onStock={(selectedId) => {
            setReagentId(selectedId);
            setStockOpen(true);
          }}
        />
      </Panel>

      <Panel
        title="Wynik badania"
        description="Kontrola zakresu z formularza zakresu badań; reakcja poza zakresem jest konfigurowalna."
      >
        <ResultEntryForm snapshot={snapshot} />
      </Panel>

      <Panel
        title="Ostatnie wyniki"
        description="Wszystkie wyniki w Twoim zakresie; czerwone wiersze wymagają powtórzenia lub zostały powtórzone."
      >
        <ResultsTable results={snapshot.results} pageSize={8} />
      </Panel>

      <p className="text-xs text-muted-foreground">
        Twoje pracownie: {snapshot.labs.map((lab) => `${lab.code} — ${lab.name}`).join(" · ")}. Skan
        urządzenia spoza listy upoważnionych kończy się komunikatem o braku uprawnień, bez
        formularza.
      </p>

      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Wpisz sprawdzenie</DialogTitle>
            <DialogDescription>
              Formularz z planu urządzenia. Liczby przyjmują przecinek, zakres sprawdza API.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
            <CheckEntryForm
              plans={writablePlans}
              equipment={snapshot.equipment}
              equipmentId={equipmentId}
              onEquipmentChange={setEquipmentId}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Spis stanu odczynnika</DialogTitle>
            <DialogDescription>
              Bez codziennego zużycia: okresowy stan plus partie przyjęte po spisie.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
            <StockCountForm
              reagents={snapshot.reagents}
              reagentId={reagentId}
              onReagentChange={setReagentId}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
