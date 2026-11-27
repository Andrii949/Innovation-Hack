import { CircleAlert, ClipboardCheck, FileText, TriangleAlert } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";

import type { Snapshot } from "@/api/types";
import { Metric, MetricStrip } from "@/components/MetricStrip";
import { PageHeader, PageMeta } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { SelectField, type SelectOption } from "@/components/SelectField";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalibrationPlanPanel } from "@/features/admin/CalibrationPlanPanel";
import { ResultsTable } from "@/features/results/ResultsTable";
import { formatRange } from "@/lib/format";

import { ReportsInbox } from "./ReportsInbox";

// Recharts is a quarter of the bundle and only the manager's second tab needs it.
const TrendChart = lazy(async () => {
  const module = await import("./TrendChart");
  return { default: module.TrendChart };
});

const CHART_PLACEHOLDER = (
  <div className="grid gap-2" aria-busy>
    <Skeleton className="h-64 w-full sm:h-72" />
    <Skeleton className="h-3 w-64" />
  </div>
);

export function ManagerPage({ snapshot }: { snapshot: Snapshot }) {
  const chartParameters = useMemo(
    () =>
      snapshot.parameters.filter(
        (parameter) =>
          parameter.minValue !== null &&
          parameter.maxValue !== null &&
          snapshot.results.some((result) => result.parameterId === parameter.id),
      ),
    [snapshot.parameters, snapshot.results],
  );
  const [parameterId, setParameterId] = useState(chartParameters[0]?.id ?? "");
  const parameter =
    chartParameters.find((candidate) => candidate.id === parameterId) ?? chartParameters[0] ?? null;

  const chartOptions = useMemo<SelectOption[]>(
    () =>
      chartParameters.map((candidate) => ({
        value: candidate.id,
        label: `${candidate.name} [${candidate.unit}]`,
      })),
    [chartParameters],
  );

  const pendingReports = snapshot.notifications.filter(
    (notification) => notification.kind === "REPORT_READY" && notification.readAt === null,
  );
  const outOfRange = useMemo(
    () => snapshot.results.filter((result) => !result.inRange),
    [snapshot.results],
  );
  const pendingVerification = outOfRange.filter((result) => result.repeat === null);
  const overdue = snapshot.schedule.filter((item) => item.status === "OVERDUE");
  const checksOverdue = overdue.filter((item) => item.kind === "CHECK");
  const plansPending = snapshot.calibrationPlans.filter((plan) => plan.status === "PENDING");

  const labRows = snapshot.labs.map((lab) => {
    const labSchedule = snapshot.schedule.filter((item) => item.labId === lab.id);
    return {
      lab,
      equipment: snapshot.equipment.filter((equipment) => equipment.labId === lab.id).length,
      overdue: labSchedule.filter((item) => item.status === "OVERDUE").length,
      dueSoon: labSchedule.filter((item) => item.status === "DUE_SOON").length,
      low: snapshot.reagents.filter(
        (reagent) => reagent.labId === lab.id && reagent.status === "LOW",
      ).length,
      stockCount: labSchedule.filter((item) => item.kind === "STOCK_COUNT").length,
    };
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        eyebrow="Kierownictwo · odbiór i weryfikacja"
        title="Nadzór kierownika"
        description="Raporty z laboratorium, wykresy próbek i weryfikacja wyników poza zakresem. Stan wszystkich pracowni w jednym miejscu."
        today={snapshot.today}
      >
        <PageMeta label="Raporty" value={snapshot.reports.length} />
        <PageMeta
          label="Do odbioru"
          value={pendingReports.length}
          tone={pendingReports.length > 0 ? "alert" : "default"}
        />
        <PageMeta label="Pracownie" value={snapshot.labs.map((lab) => lab.code).join(" / ")} />
        <PageMeta
          label="Plany do zatwierdzenia"
          value={plansPending.length}
          tone={plansPending.length > 0 ? "alert" : "default"}
        />
      </PageHeader>

      <MetricStrip>
        <Metric
          label="Raporty do odbioru"
          value={pendingReports.length}
          hint={`wszystkie: ${snapshot.reports.length}`}
          tone={pendingReports.length > 0 ? "warning" : "default"}
          icon={FileText}
        />
        <Metric
          label="Wyniki do powtórzenia"
          value={pendingVerification.length}
          hint={`poza zakresem: ${outOfRange.length}`}
          tone={pendingVerification.length > 0 ? "error" : "default"}
          icon={CircleAlert}
        />
        <Metric
          label="Po terminie"
          value={overdue.length}
          hint="wszystkie rodzaje terminów"
          tone={overdue.length > 0 ? "error" : "default"}
          icon={TriangleAlert}
        />
        <Metric
          label="Sprawdzenia po terminie"
          value={checksOverdue.length}
          hint="wpisy planów sprawdzeń"
          tone={checksOverdue.length > 0 ? "warning" : "default"}
          icon={ClipboardCheck}
        />
      </MetricStrip>

      <Tabs defaultValue="raporty" className="min-w-0">
        <TabsList
          variant="line"
          className="no-scrollbar h-auto w-full flex-wrap justify-start gap-0 sm:flex-nowrap sm:overflow-x-auto sm:border-b"
        >
          <TabsTrigger
            className="flex-none gap-2 px-2 pb-2 text-xs sm:px-3 sm:text-sm data-active:text-primary data-active:after:bg-chart-2"
            value="raporty"
          >
            <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
              01
            </span>
            Raporty
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-2 pb-2 text-xs sm:px-3 sm:text-sm data-active:text-primary data-active:after:bg-chart-2"
            value="plany"
          >
            <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
              02
            </span>
            Plan wzorcowania
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-2 pb-2 text-xs sm:px-3 sm:text-sm data-active:text-primary data-active:after:bg-chart-2"
            value="wykres"
          >
            <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
              03
            </span>
            Wykres próbek
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-2 pb-2 text-xs sm:px-3 sm:text-sm data-active:text-primary data-active:after:bg-chart-2"
            value="weryfikacja"
          >
            <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
              04
            </span>
            Weryfikacja
          </TabsTrigger>
          <TabsTrigger
            className="flex-none gap-2 px-2 pb-2 text-xs sm:px-3 sm:text-sm data-active:text-primary data-active:after:bg-chart-2"
            value="pracownie"
          >
            <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
              05
            </span>
            Pracownie
          </TabsTrigger>
        </TabsList>

        <TabsContent value="raporty">
          <Panel
            title="Raporty z biura"
            description="Biuro generuje raport z harmonogramu, spisów i wyników; kierownik dostaje powiadomienie i otwiera raport."
          >
            <ReportsInbox snapshot={snapshot} />
          </Panel>
        </TabsContent>

        <TabsContent value="plany">
          <Panel
            title="Zatwierdzanie planu wzorcowania"
            description="Kierownik zatwierdza wysyłkę tylko wtedy, gdy w pracowni zostaje wymagana liczba urządzeń zamiennych."
          >
            <CalibrationPlanPanel snapshot={snapshot} />
          </Panel>
        </TabsContent>

        <TabsContent value="wykres">
          <Panel
            title="Wykres próbek i kontrola zakresu"
            description="Punkty to wyniki kolejnych próbek; pas i linie przerywane to zakres parametru."
          >
            {parameter === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Brak parametrów z zakresem i wynikami.
              </p>
            ) : (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="grid gap-1">
                    <span className="text-xs text-muted-foreground">Parametr</span>
                    <SelectField
                      value={parameter.id}
                      options={chartOptions}
                      onValueChange={setParameterId}
                      ariaLabel="Parametr wykresu"
                      className="w-72 max-w-full"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {parameter.material} ·{" "}
                    {formatRange(parameter.minValue, parameter.maxValue, parameter.unit)} ·{" "}
                    {parameter.accredited ? "akredytowane" : "nieakredytowane"}
                  </p>
                </div>
                <Suspense fallback={CHART_PLACEHOLDER}>
                  <TrendChart parameter={parameter} results={snapshot.results} />
                </Suspense>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="weryfikacja">
          <Panel
            title="Weryfikacja wyników poza zakresem"
            description={`${pendingVerification.length} z ${outOfRange.length} wyników bez powtórzenia. Powtórzenie zapisuje pracownia; oryginał zostaje w historii.`}
          >
            <ResultsTable results={outOfRange} emptyText="Brak wyników poza zakresem." />
          </Panel>
        </TabsContent>

        <TabsContent value="pracownie">
          <Panel
            title="Stan pracowni"
            description="Terminy i stany z jednego harmonogramu; liczby są liczone przez API na bieżąco."
          >
            <div className="grid gap-2 sm:hidden">
              {labRows.map((row) => (
                <div key={row.lab.id} className="rounded-xl border border-border/70 p-3">
                  <p className="text-sm font-medium">
                    {row.lab.code} — {row.lab.name}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Urządzenia</dt>
                      <dd className="font-medium tabular-nums">{row.equipment}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Po terminie</dt>
                      <dd
                        className={
                          row.overdue > 0
                            ? "font-semibold tabular-nums text-red-700 dark:text-red-400"
                            : "font-medium tabular-nums"
                        }
                      >
                        {row.overdue}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Blisko terminu</dt>
                      <dd className="font-medium tabular-nums">{row.dueSoon}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Mało odczynnika</dt>
                      <dd className="font-medium tabular-nums">{row.low}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pracownia</TableHead>
                    <TableHead className="text-right">Urządzenia</TableHead>
                    <TableHead className="text-right">Po terminie</TableHead>
                    <TableHead className="text-right">Blisko terminu</TableHead>
                    <TableHead className="text-right">Mało odczynnika</TableHead>
                    <TableHead className="text-right">Spis zaległy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labRows.map((row) => (
                    <TableRow key={row.lab.id}>
                      <TableCell className="font-medium">
                        {row.lab.code} — {row.lab.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.equipment}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.overdue}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.dueSoon}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.low}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.stockCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
