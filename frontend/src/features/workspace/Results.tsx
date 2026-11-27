import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { api, type ApiRecord, errorMessage, objectValue, textValue } from "@/api/workspaceClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { apiSave, DownloadButton } from "./Equipment";
import {
  Action,
  choice,
  type Columns,
  Control,
  type Field,
  Loading,
  Message,
  options,
  Rows,
  selectStyle,
  today,
  useApi,
  type WorkspaceProps,
} from "./shared";

const parameterFields: Field[] = [
  { key: "name", label: "Nazwa parametru", required: true },
  { key: "material", label: "Materiał" },
  { key: "unit", label: "Jednostka", required: true },
  { key: "min_value", label: "Dolna granica wpisu", clear: true },
  { key: "max_value", label: "Górna granica wpisu", clear: true },
  { key: "verify_min", label: "Dolny próg weryfikacji", clear: true },
  { key: "verify_max", label: "Górny próg weryfikacji", clear: true },
  { key: "method", label: "Metoda", clear: true },
  { key: "accredited", label: "Akredytowany", type: "boolean" },
  { key: "active", label: "Aktywny", type: "boolean" },
  {
    key: "out_of_range_action",
    label: "Reakcja na przekroczenie",
    type: "options",
    options: choice(["FLAG", "Oznacz wynik"], ["BLOCK", "Zablokuj zapis"]),
    clear: true,
  },
];

const parameterInitial: ApiRecord = { material: "Cement" };

export function Results({
  token,
  permissions,
  equipmentId,
}: WorkspaceProps & { equipmentId?: number }) {
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState("");
  const [csv, setCsv] = useState<File>();
  const [importing, setImporting] = useState(false);
  const [repeatId, setRepeatId] = useState<number>();
  const after = () => setRevision((value) => value + 1);
  const canWrite = permissions.includes("result:write");
  const admin = permissions.includes("settings:write");
  const office = permissions.includes("report:read");
  const canReview = permissions.includes("result:review");
  const parameters = useApi<ApiRecord[]>("/test-parameters", token, revision);
  const query = new URLSearchParams();
  if (filter !== "") {
    query.set("parameter_id", filter);
  }
  if (equipmentId !== undefined) {
    query.set("equipment_id", String(equipmentId));
  }
  const data = useApi<ApiRecord[]>(`/test-results?${query}`, token, revision);
  const parameterOptions = useMemo(
    () => options((parameters?.data ?? []).filter((row) => row.active === true)),
    [parameters],
  );
  const devices = useApi<ApiRecord[]>(canWrite ? "/equipment" : null, token);
  const resultFields = useMemo<Field[]>(
    () => [
      {
        key: "parameter_id",
        label: "Parametr badania",
        type: "options",
        numeric: true,
        required: true,
        options: parameterOptions,
      },
      {
        key: "equipment_id",
        label: "Urządzenie (opcjonalnie)",
        type: "options",
        numeric: true,
        options: (devices?.data ?? [])
          .filter((device) => device.withdrawn_at == null)
          .map((device) => ({
            value: textValue(device.id),
            label: `${textValue(device.code)} · ${textValue(device.name)}`,
          })),
      },
      { key: "sample_label", label: "Identyfikator próbki", required: true },
      {
        key: "value",
        label: "Wynik pomiaru",
        required: true,
        hint: "Możesz użyć przecinka dziesiętnego.",
      },
    ],
    [parameterOptions, devices],
  );
  const scopedFields = useMemo(
    () =>
      equipmentId === undefined
        ? resultFields
        : resultFields.filter(({ key }) => key !== "equipment_id"),
    [equipmentId, resultFields],
  );
  const selectedDevice = devices?.data?.find((device) => device.id === equipmentId);
  const resultInitial = useMemo<ApiRecord>(() => ({ parameter_id: filter }), [filter]);
  async function importCsv() {
    if (csv === undefined) {
      return;
    }
    setImporting(true);
    try {
      const body = new FormData();
      body.set("file", csv);
      const response = await api<{ imported: number }>(
        "/test-parameters/import",
        token,
        "POST",
        body,
      );
      toast.success(`Zaimportowano parametrów: ${response.imported}`);
      setCsv(undefined);
      after();
    } catch (failure) {
      toast.error(errorMessage(failure));
    } finally {
      setImporting(false);
    }
  }
  return (
    <div className="grid gap-4">
      {office && (
        <ResultChart
          token={token}
          parameters={parameterOptions}
          preferred={textValue(data?.data?.[0]?.parameter_id, "")}
          revision={revision}
        />
      )}
      <Card>
        <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
          <div>
            <CardTitle>Wyniki badań</CardTitle>
            <CardDescription>Wyniki próbek i kontrola zakresu wpisu.</CardDescription>
          </div>
          {canWrite && (
            <Action
              label="Wpisz wynik badania"
              defaultOpen={equipmentId !== undefined}
              primary
              description={
                equipmentId === undefined
                  ? undefined
                  : `Wynik dla urządzenia: ${textValue(selectedDevice?.name, "z otwartej karty")}.`
              }
              fields={scopedFields}
              initial={resultInitial}
              save={(payload) =>
                api(
                  "/test-results",
                  token,
                  "POST",
                  equipmentId === undefined ? payload : { ...payload, equipment_id: equipmentId },
                )
              }
              after={after}
            />
          )}
        </CardHeader>
        <CardContent className="grid gap-3">
          <Control label="Filtruj po parametrze" htmlFor="filter-result-parameter">
            <select
              id="filter-result-parameter"
              className={selectStyle}
              value={filter}
              onChange={(event) => setFilter(event.currentTarget.value)}
            >
              <option value="">Wszystkie parametry</option>
              {(parameters?.data ?? []).map((row) => (
                <option key={textValue(row.id)} value={textValue(row.id)}>
                  {textValue(row.name)}
                </option>
              ))}
            </select>
          </Control>
          {data?.data ? (
            <Rows
              rows={data.data}
              columns={resultColumns}
              renderAction={(row) => (
                <>
                  {canReview && (row.in_range === false || row.review_decision != null) && (
                    <ResultReview token={token} row={row} after={after} />
                  )}
                  {canWrite &&
                    (row.in_range === false || row.review_decision === "REPEAT") &&
                    (repeatId === row.id ? (
                      <Action
                        label="Wpisz powtórzenie"
                        fields={resultFields}
                        initial={row}
                        save={(payload) =>
                          api("/test-results", token, "POST", { ...payload, repeat_of_id: row.id })
                        }
                        after={() => {
                          setRepeatId(undefined);
                          after();
                        }}
                      />
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setRepeatId(Number(row.id))}>
                        Powtórz
                      </Button>
                    ))}
                </>
              )}
            />
          ) : (
            <Loading state={data} />
          )}
        </CardContent>
      </Card>
      {admin && (
        <Card>
          <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
            <div>
              <CardTitle>Parametry badań</CardTitle>
              <CardDescription>Jednostki, zakresy wpisu i progi na wykresach.</CardDescription>
            </div>
            <Action
              label="Dodaj parametr"
              fields={parameterFields}
              initial={parameterInitial}
              save={apiSave("/test-parameters", token, "POST")}
              after={after}
            />
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-end gap-2">
              <Control label="Parametry z pliku CSV (UTF-8)" htmlFor="parameter-csv">
                <Input
                  id="parameter-csv"
                  key={csv === undefined ? "empty" : "file"}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setCsv(event.currentTarget.files?.[0])}
                />
              </Control>
              <Button
                variant="outline"
                disabled={csv === undefined || importing}
                onClick={importCsv}
              >
                Importuj CSV
              </Button>
            </div>
            {parameters?.data ? (
              <Rows
                rows={parameters.data}
                columns={parameterColumns}
                renderAction={(row) => (
                  <Action
                    label="Edytuj"
                    fields={parameterFields}
                    initial={row}
                    save={apiSave(`/test-parameters/${Number(row.id)}`, token, "PATCH")}
                    after={after}
                  />
                )}
              />
            ) : (
              <Loading state={parameters} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type Series = {
  parameter: { name: string; unit: string };
  threshold_min: string | null;
  threshold_max: string | null;
  points: {
    at: string;
    sample_label: string;
    value: string;
    status: "IN_RANGE" | "BELOW" | "ABOVE";
  }[];
  count: number;
  out_of_threshold: number;
};

function firstDay() {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const chartMargin = { top: 12, right: 20, bottom: 4, left: 10 };
const automaticDomain: [string, string] = ["auto", "auto"];

function ThresholdDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: unknown }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={objectValue(payload).status === "IN_RANGE" ? "var(--brand-navy)" : "var(--destructive)"}
    />
  );
}

const thresholdDot = <ThresholdDot />;

function ResultChart({
  token,
  parameters,
  preferred,
  revision,
}: {
  token: string;
  parameters: { value: string; label: string }[];
  preferred: string;
  revision: number;
}) {
  const [parameter, setParameter] = useState("");
  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);
  const initial =
    parameters.find(({ value }) => value === preferred)?.value ?? parameters[0]?.value;
  const active = parameter || initial;
  const valid = active && from && to && from <= to;
  const data = useApi<Series>(
    valid ? `/test-results/series?parameter_id=${active}&from=${from}&to=${to}` : null,
    token,
    revision,
  );
  const ticks = useMemo(
    () =>
      data?.data?.points.map((point) => ({
        ...point,
        measurement: Number(point.value),
        label: `${point.at.slice(0, 10)} · ${point.sample_label}`,
      })) ?? [],
    [data],
  );
  const lower = data?.data?.threshold_min;
  const upper = data?.data?.threshold_max;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wykres pomiarów i progi weryfikacji</CardTitle>
        <CardDescription>
          Linie wyznaczają progi weryfikacji. Pomiary poza progiem mają czerwone znaczniki.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Control label="Parametr na wykresie" htmlFor="chart-parameter">
            <select
              id="chart-parameter"
              className={selectStyle}
              value={active ?? ""}
              onChange={(event) => setParameter(event.currentTarget.value)}
            >
              <option value="">Wybierz parametr</option>
              {parameters.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Control>
          <Control label="Od" htmlFor="chart-from">
            <Input
              id="chart-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.currentTarget.value)}
            />
          </Control>
          <Control label="Do" htmlFor="chart-to">
            <Input
              id="chart-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.currentTarget.value)}
            />
          </Control>
        </div>
        {!valid ? (
          <Message>Wybierz parametr i poprawny zakres dat.</Message>
        ) : !data?.data ? (
          <Loading state={data} />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">{data.data.count} pomiarów</Badge>
              <Badge variant={data.data.out_of_threshold > 0 ? "destructive" : "outline"}>
                {data.data.out_of_threshold} poza progiem
              </Badge>
              <Badge variant="outline">Dolny próg: {lower ?? "brak"}</Badge>
              <Badge variant="outline">Górny próg: {upper ?? "brak"}</Badge>
            </div>
            {ticks.length === 0 ? (
              <Message>Brak pomiarów w wybranym okresie.</Message>
            ) : (
              <figure
                className="h-72 min-w-0"
                aria-label={`Wykres parametru ${data.data.parameter.name}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ticks} margin={chartMargin}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickFormatter={(label: string) => label.slice(5, 10)}
                      minTickGap={24}
                      fontSize={12}
                    />
                    <YAxis
                      unit={` ${data.data.parameter.unit}`}
                      domain={automaticDomain}
                      fontSize={12}
                    />
                    <Tooltip />
                    {lower != null && upper != null && (
                      <ReferenceArea
                        y1={Number(lower)}
                        y2={Number(upper)}
                        fill="#8dc63f"
                        fillOpacity={0.14}
                        ifOverflow="extendDomain"
                      />
                    )}
                    {lower != null && (
                      <ReferenceLine
                        y={Number(lower)}
                        stroke="#60a501"
                        strokeDasharray="5 4"
                        ifOverflow="extendDomain"
                      />
                    )}
                    {upper != null && (
                      <ReferenceLine
                        y={Number(upper)}
                        stroke="#60a501"
                        strokeDasharray="5 4"
                        ifOverflow="extendDomain"
                      />
                    )}
                    <Line
                      type="linear"
                      name="Wynik pomiaru"
                      unit={` ${data.data.parameter.unit}`}
                      dataKey="measurement"
                      stroke="var(--brand-navy)"
                      strokeWidth={2}
                      dot={thresholdDot}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </figure>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const resultReviewFields: Field[] = [
  {
    key: "decision",
    label: "Decyzja",
    type: "options",
    options: choice(["ACCEPTED", "Zaakceptuj"], ["REPEAT", "Skieruj do powtórzenia"]),
    required: true,
  },
  { key: "note", label: "Uzasadnienie", required: true, type: "note" },
];

function ResultReview({ token, row, after }: { token: string; row: ApiRecord; after: () => void }) {
  if (row.review_decision === "ACCEPTED" || row.review_decision === "REPEAT") {
    return (
      <Badge variant="outline">
        {row.review_decision === "ACCEPTED" ? "Zaakceptowano" : "Do powtórzenia"}
      </Badge>
    );
  }
  return (
    <Action
      label="Zweryfikuj"
      description="Zapisz decyzję i uzasadnienie po sprawdzeniu źródłowego pomiaru."
      fields={resultReviewFields}
      save={apiSave(`/test-results/${Number(row.id)}/review`, token, "POST")}
      after={after}
    />
  );
}

export function Reports({ token, permissions }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const reports = useApi<ApiRecord[]>("/reports", token, revision);
  const parameters = useApi<ApiRecord[]>("/test-parameters", token);
  const reportFields = useMemo<Field[]>(
    () => [
      { key: "period_from", label: "Początek okresu", type: "date", required: true },
      { key: "period_to", label: "Koniec okresu", type: "date", required: true },
      {
        key: "parameter_ids",
        label: "Parametry (puste = wszystkie z pomiarami)",
        type: "many",
        numeric: true,
        options: options(parameters?.data ?? []),
      },
    ],
    [parameters],
  );
  const reportInitial = useMemo<ApiRecord>(
    () => ({ period_from: firstDay(), period_to: today() }),
    [],
  );
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
        <div>
          <CardTitle>Raporty dla kierownika</CardTitle>
          <CardDescription>Wyniki, wykresy i podsumowanie weryfikacji w PDF.</CardDescription>
        </div>
        {permissions.includes("report:write") && (
          <Action
            label="Generuj i przekaż raport"
            primary
            fields={reportFields}
            initial={reportInitial}
            save={apiSave("/reports", token, "POST")}
            after={() => setRevision((value) => value + 1)}
          />
        )}
      </CardHeader>
      <CardContent>
        {reports?.data ? (
          <Rows
            rows={reports.data}
            columns={reportColumns}
            renderAction={(row) => (
              <DownloadButton
                token={token}
                path={`/reports/${Number(row.id)}.pdf`}
                filename={`raport-${Number(row.id)}.pdf`}
                label="Pobierz raport PDF"
              />
            )}
          />
        ) : (
          <Loading state={reports} />
        )}
      </CardContent>
    </Card>
  );
}

const resultColumns: Columns = [
  ["sample_label", "Próbka"],
  ["parameter_name", "Parametr"],
  ["value", "Wartość"],
  ["unit", "Jednostka"],
  ["equipment_code", "Urządzenie"],
  [
    "in_range",
    "Zakres wpisu",
    (value) => (
      <Badge variant={value ? "outline" : "destructive"}>
        {value ? "W zakresie" : "Poza zakresem"}
      </Badge>
    ),
  ],
  ["created_at", "Data", (value) => textValue(value).slice(0, 10)],
];

const parameterColumns: Columns = [
  ["name", "Parametr"],
  ["unit", "Jednostka"],
  ["verify_min", "Próg dolny"],
  ["verify_max", "Próg górny"],
];

const reportColumns: Columns = [
  ["id", "Nr raportu"],
  ["period_from", "Okres od"],
  ["period_to", "Okres do"],
  ["created_at", "Utworzono", (value) => textValue(value).slice(0, 10)],
];
