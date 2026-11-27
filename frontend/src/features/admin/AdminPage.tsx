import { Beaker, CalendarDays, CircleAlert, Clock, List, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import type { DueKind, Snapshot } from "@/api/types";
import { DUE_KINDS } from "@/api/types";
import { Metric, MetricStrip } from "@/components/MetricStrip";
import { PageHeader, PageMeta } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { SelectField, type SelectOption } from "@/components/SelectField";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ResultsTable } from "@/features/results/ResultsTable";
import { dueKindLabel, isDueKind } from "@/lib/status";

import { AuditList } from "./AuditList";
import { DueHorizon } from "./DueHorizon";
import { EquipmentSection } from "./EquipmentSection";
import { ReagentPanel } from "./ReagentPanel";
import { ReportComposer } from "./ReportComposer";
import { ScheduleCalendar } from "./ScheduleCalendar";
import { ScheduleTable } from "./ScheduleTable";

const KIND_OPTIONS: SelectOption[] = [
  { value: "ALL", label: "Wszystkie" },
  ...DUE_KINDS.map((kind) => ({ value: kind, label: dueKindLabel(kind) })),
];

export function AdminPage({ snapshot }: { snapshot: Snapshot }) {
  const [tab, setTab] = useState("harmonogram");
  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [labFilter, setLabFilter] = useState("ALL");
  const [kindFilter, setKindFilter] = useState<"ALL" | DueKind>("ALL");
  const [showAll, setShowAll] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(
    snapshot.equipment[0]?.id ?? null,
  );

  const labOptions = useMemo<SelectOption[]>(
    () => [
      { value: "ALL", label: "Wszystkie" },
      ...snapshot.labs.map((lab) => ({ value: lab.id, label: `${lab.code} — ${lab.name}` })),
    ],
    [snapshot.labs],
  );

  const overdue = snapshot.schedule.filter((item) => item.status === "OVERDUE");
  const dueSoon = snapshot.schedule.filter((item) => item.status === "DUE_SOON");
  const lowStock = snapshot.schedule.filter((item) => item.status === "LOW");
  const outOfRange = snapshot.results.filter((result) => !result.inRange);
  const repeatPending = outOfRange.filter((result) => result.repeat === null);

  const filtered = useMemo(
    () =>
      snapshot.schedule.filter((item) => {
        if (labFilter !== "ALL" && item.labId !== labFilter) {
          return false;
        }
        return kindFilter === "ALL" || item.kind === kindFilter;
      }),
    [snapshot.schedule, labFilter, kindFilter],
  );

  const visible = useMemo(() => {
    if (view === "calendar") {
      return filtered;
    }
    return filtered.filter(
      (item) => showAll || (item.status !== "OK" && item.status !== "NOT_REQUIRED"),
    );
  }, [filtered, view, showAll]);

  const selectEquipment = (equipmentId: string): void => {
    setSelectedEquipmentId(equipmentId);
    setTab("urzadzenia");
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow="Biuro · nadzór 17025"
        title="Rejestr i harmonogram"
        description="Terminy liczone z danych, karty urządzeń i kolejka powtórzeń. Jeden harmonogram dla wszystkich pracowni."
        today={snapshot.today}
      >
        <PageMeta label="Rejestr" value={`${snapshot.equipment.length} urządzeń`} />
        <PageMeta label="Pracownie" value={snapshot.labs.map((lab) => lab.code).join(" / ")} />
        <PageMeta
          label="Otwarte alerty"
          value={overdue.length + dueSoon.length + lowStock.length + repeatPending.length}
          tone={
            overdue.length + dueSoon.length + lowStock.length + repeatPending.length > 0
              ? "alert"
              : "default"
          }
        />
      </PageHeader>

      <MetricStrip>
        <Metric
          label="Po terminie"
          value={overdue.length}
          hint="wzorcowania, sprawdzenia, partie"
          tone={overdue.length > 0 ? "error" : "default"}
          icon={TriangleAlert}
        />
        <Metric
          label="Zbliża się termin"
          value={dueSoon.length}
          hint="alert wg wyprzedzenia"
          tone={dueSoon.length > 0 ? "warning" : "default"}
          icon={Clock}
        />
        <Metric
          label="Mało odczynnika"
          value={lowStock.length}
          hint="poniżej progu minimalnego"
          tone={lowStock.length > 0 ? "error" : "default"}
          icon={Beaker}
        />
        <Metric
          label="Wyniki do powtórzenia"
          value={repeatPending.length}
          hint={`poza zakresem: ${outOfRange.length}`}
          tone={repeatPending.length > 0 ? "error" : "default"}
          icon={CircleAlert}
        />
      </MetricStrip>

      <DueHorizon items={snapshot.schedule} today={snapshot.today} />

      <Tabs value={tab} onValueChange={setTab} className="min-w-0">
        <TabsList
          variant="line"
          className="no-scrollbar h-auto w-full justify-start gap-0 overflow-x-auto border-b"
        >
          <TabsTrigger
            className="flex-none gap-2 px-3 pb-2 data-active:text-primary data-active:after:bg-chart-2"
            value="harmonogram"
          >
            <span className="font-mono text-[10px] text-muted-foreground/70">01</span>
            Harmonogram
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-3 pb-2 data-active:text-primary data-active:after:bg-chart-2"
            value="urzadzenia"
          >
            <span className="font-mono text-[10px] text-muted-foreground/70">02</span>
            Urządzenia
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-3 pb-2 data-active:text-primary data-active:after:bg-chart-2"
            value="odczynniki"
          >
            <span className="font-mono text-[10px] text-muted-foreground/70">03</span>
            Odczynniki
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-3 pb-2 data-active:text-primary data-active:after:bg-chart-2"
            value="wyniki"
          >
            <span className="font-mono text-[10px] text-muted-foreground/70">04</span>
            Wyniki
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-3 pb-2 data-active:text-primary data-active:after:bg-chart-2"
            value="raporty"
          >
            <span className="font-mono text-[10px] text-muted-foreground/70">05</span>
            Raporty
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-3 pb-2 data-active:text-primary data-active:after:bg-chart-2"
            value="historia"
          >
            <span className="font-mono text-[10px] text-muted-foreground/70">06</span>
            Historia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="harmonogram">
          <Panel
            title="Harmonogram"
            description="Kalendarz terminów albo lista do szybkiego przeglądu. Jedno źródło: wzorcowania, sprawdzenia, ważność partii, stany i spisy."
          >
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
                  Pracownia
                </span>
                <SelectField
                  value={labFilter}
                  onValueChange={setLabFilter}
                  options={labOptions}
                  ariaLabel="Pracownia"
                  className="w-56"
                />
              </div>
              <div className="grid gap-1">
                <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
                  Rodzaj
                </span>
                <SelectField
                  value={kindFilter}
                  onValueChange={(value) => {
                    setKindFilter(value === "ALL" || !isDueKind(value) ? "ALL" : value);
                  }}
                  options={KIND_OPTIONS}
                  ariaLabel="Rodzaj"
                  className="w-48"
                />
              </div>
              {view === "table" && (
                <div className="flex h-8 items-center gap-2">
                  <Checkbox
                    id="show-all"
                    checked={showAll}
                    onCheckedChange={(checked) => {
                      setShowAll(checked === true);
                    }}
                  />
                  <Label htmlFor="show-all" className="text-sm font-normal">
                    Pokaż bez alertu
                  </Label>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={view}
                  onValueChange={(value) => {
                    if (value === "calendar" || value === "table") {
                      setView(value);
                    }
                  }}
                  variant="outline"
                  size="sm"
                  spacing={0}
                >
                  <ToggleGroupItem
                    value="calendar"
                    aria-label="Widok kalendarza"
                    className="gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <CalendarDays aria-hidden />
                    <span className="hidden sm:inline">Kalendarz</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="table"
                    aria-label="Widok listy"
                    className="gap-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <List aria-hidden />
                    <span className="hidden sm:inline">Lista</span>
                  </ToggleGroupItem>
                </ToggleGroup>
                <span className="rounded-full border bg-background px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                  {visible.length} / {snapshot.schedule.length} poz.
                </span>
              </div>
            </div>
            {view === "calendar" ? (
              <ScheduleCalendar
                items={visible}
                today={snapshot.today}
                onSelectEquipment={selectEquipment}
              />
            ) : (
              <ScheduleTable items={visible} onSelectEquipment={selectEquipment} />
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="urzadzenia">
          <Panel
            title="Rejestr urządzeń"
            description="Karta 17025 6.4.13: identyfikacja, producent, lokalizacja, wzorcowania, sprawdzenia, upoważnienia."
          >
            <EquipmentSection
              snapshot={snapshot}
              selectedId={selectedEquipmentId}
              onSelectId={setSelectedEquipmentId}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="odczynniki">
          <Panel
            title="Odczynniki i CRM"
            description="Stan z ostatniego spisu plus partie przyjęte później; próg i wyprzedzenie na karcie odczynnika."
          >
            <ReagentPanel reagents={snapshot.reagents} />
          </Panel>
        </TabsContent>

        <TabsContent value="wyniki">
          <Panel
            title="Wyniki badań i kontrola zakresu"
            description="Zakres zapisany przy wyniku; poza zakresem wymaga powtórzenia, a administrator widzi je od razu."
          >
            <ResultsTable results={snapshot.results} limit={8} />
          </Panel>
        </TabsContent>

        <TabsContent value="raporty">
          <ReportComposer snapshot={snapshot} />
        </TabsContent>

        <TabsContent value="historia">
          {snapshot.audit.length > 0 ? (
            <Panel
              title="Historia zmian"
              description="Każdy zapis i zmiana ustawień zostawia wpis: kto, kiedy, co było i co jest."
            >
              <AuditList audit={snapshot.audit} />
            </Panel>
          ) : (
            <Panel title="Historia zmian" description="Brak wpisów w zakresie uprawnień.">
              <p className="text-sm text-muted-foreground">Brak historii do wyświetlenia.</p>
            </Panel>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
