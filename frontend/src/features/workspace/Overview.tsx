import { cn } from "cn";
import {
  ArrowRight,
  ChartLine,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { type ApiRecord, textValue } from "@/api/workspaceClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type AuditEntry, describeAudit } from "@/lib/audit";
import { formatDate, formatDecimal, formatRange } from "@/lib/format";
import { formatMonth } from "@/lib/months";
import { overviewSchedule, scheduleDevice, scheduleDue } from "@/lib/overview";
import { dueKindLabel, isDueKind } from "@/lib/status";

import { CalibrationEntry } from "./CalibrationEntry";
import { equipmentStatusLabel, Status } from "./Equipment";
import { ResultChart, ResultReviewStatus } from "./Results";
import {
  type Columns,
  Loading,
  Message,
  options,
  Rows,
  useApi,
  type WorkspaceProps,
} from "./shared";

import "./overview.css";

type Device = {
  id: number;
  public_id: string;
  lab_id: number;
  code: string;
  name: string;
  status: string;
  next_due_month: string | null;
};
type Lab = { id: number; code: string; name: string };
type DueRow = {
  kind: string;
  ref_type: string;
  ref_id: number;
  lab_id: number;
  label: string;
  due: string | null;
  valid_until: string | null;
  status: string;
};
type Reagent = {
  id: number;
  current_stock: string;
  usable_stock_estimate: string | null;
  unit: string;
};
type AuditRow = AuditEntry & { id: number; at: string; user_id: number | null };
export type OverviewTarget = "schedule" | "reagents" | "results" | "audit";

type Issue = {
  key: string;
  group: string;
  name: string;
  detail: string;
  status: string;
  tone: "alarm" | "missing" | "stock";
  icon: LucideIcon;
  label: string;
  open: () => void;
  calibration?: Device;
};

const emptyLabs: Lab[] = [];
const emptyDevices: Device[] = [];
const emptyRecords: ApiRecord[] = [];

const fullDate = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Warsaw",
});

function resultReading(row: ApiRecord) {
  const unit = textValue(row.unit, "");
  const value = formatDecimal(textValue(row.value));
  return unit === "%" ? `${value}%` : `${value} ${unit}`.trim();
}

function issueStatus(row: DueRow) {
  if (row.kind === "CALIBRATION") {
    return row.status === "NO_DATA" ? "Brak wpisu o wzorcowaniu" : "Wzorcowanie po terminie";
  }
  if (row.kind === "CHECK") {
    return row.status === "NO_DATA" ? "Brak wpisu o sprawdzeniu" : "Sprawdzenie po terminie";
  }
  return equipmentStatusLabel(row.status);
}

function issueOrder(issues: Issue[]) {
  const seen = new Set<string>();
  const priority: Issue[] = [];
  const rest: Issue[] = [];
  for (const issue of issues) {
    if (seen.has(issue.group)) {
      rest.push(issue);
    } else {
      seen.add(issue.group);
      priority.push(issue);
    }
  }
  return [...priority, ...rest];
}

export function Overview({
  token,
  permissions,
  onOpenDevice,
  onNavigate,
}: WorkspaceProps & {
  onOpenDevice: (publicId: string) => void;
  onNavigate: (section: OverviewTarget) => void;
}) {
  const [labId, setLabId] = useState("");
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const can = (permission: string) => permissions.includes(permission);
  const devices = useApi<Device[]>(can("equipment:read") ? "/equipment" : null, token, revision);
  const labs = useApi<Lab[]>("/labs", token);
  const schedule = useApi<DueRow[]>("/schedule?include_ok=true", token, revision);
  const results = useApi<ApiRecord[]>(can("result:read") ? "/test-results" : null, token);
  const reagents = useApi<Reagent[]>(can("reagent:read") ? "/reagents" : null, token);
  const parameters = useApi<ApiRecord[]>(can("report:read") ? "/test-parameters" : null, token);
  const audit = useApi<AuditRow[]>(can("audit:read") ? "/audit" : null, token);
  const users = useApi<ApiRecord[]>(can("users:write") ? "/users" : null, token);
  const availableLabs = labs?.data ?? emptyLabs;
  const selectedLab = availableLabs.find(({ id }) => String(id) === labId);
  const deviceRows = devices?.data ?? emptyDevices;
  const scopedLabId = selectedLab?.id;
  const visibleDevices = useMemo(
    () =>
      scopedLabId === undefined
        ? deviceRows
        : deviceRows.filter(({ lab_id }) => lab_id === scopedLabId),
    [deviceRows, scopedLabId],
  );
  const flagged = useMemo(() => {
    const visibleIds = new Set(visibleDevices.map(({ id }) => id));
    return (results?.data ?? emptyRecords).filter(
      (row) =>
        row.in_range === false &&
        (scopedLabId === undefined ||
          (typeof row.equipment_id === "number" && visibleIds.has(row.equipment_id))),
    );
  }, [results, scopedLabId, visibleDevices]);
  const preferred = textValue((flagged[0] ?? results?.data?.[0])?.parameter_id, "");
  const scheduleRows = (schedule?.data ?? []).filter(
    (row) => !selectedLab || row.lab_id === selectedLab.id,
  );
  const { pressing, upcoming } = overviewSchedule(scheduleRows);

  function openSchedule(row: DueRow) {
    const device = scheduleDevice(row, deviceRows);
    if (device) {
      onOpenDevice(device.public_id);
    } else {
      onNavigate(
        row.ref_type.startsWith("reagent") && can("reagent:read") ? "reagents" : "schedule",
      );
    }
  }

  const scheduleIssues = pressing.map((row): Issue => {
    const device = scheduleDevice(row, deviceRows);
    const reagent =
      row.ref_type === "reagent" ? reagents?.data?.find(({ id }) => id === row.ref_id) : undefined;
    const amount = reagent
      ? `${formatDecimal(reagent.usable_stock_estimate ?? reagent.current_stock)} ${reagent.unit}`.trim()
      : "";
    const due = row.due ? `Termin: ${scheduleDue(row)}` : "";
    const stock = row.kind === "LOW_STOCK";
    const missing = row.status === "NO_DATA";
    return {
      key: `${row.kind}-${row.ref_type}-${row.ref_id}`,
      group: stock ? "stock" : row.status,
      name: row.kind === "CALIBRATION" && device ? device.name : row.label,
      detail: stock
        ? amount
        : [row.kind === "CALIBRATION" ? device?.code : undefined, due].filter(Boolean).join(" · "),
      status: issueStatus(row),
      tone: stock ? "stock" : missing ? "missing" : "alarm",
      icon: stock ? FlaskConical : Clock3,
      label: device
        ? "Otwórz kartę urządzenia"
        : row.ref_type.startsWith("reagent") && can("reagent:read")
          ? "Otwórz odczynniki"
          : "Otwórz harmonogram",
      open: () => openSchedule(row),
      calibration: row.kind === "CALIBRATION" && can("calibration:write") ? device : undefined,
    };
  });

  const [firstIssue, ...remainingIssues] = scheduleIssues;
  const issues = issueOrder([
    ...(firstIssue ? [firstIssue] : []),
    ...flagged.map((row): Issue => ({
      key: `result-${textValue(row.id)}`,
      group: "result",
      name: `${textValue(row.parameter_name)} · próbka ${textValue(row.sample_label)}`,
      detail: resultReading(row),
      status: "Poza zakresem",
      tone: "alarm",
      icon: ChartLine,
      label: "Otwórz wyniki badań",
      open: () => onNavigate("results"),
    })),
    ...remainingIssues,
  ]);
  const [focus, ...otherIssues] = issues;
  const visibleIssues = expanded ? otherIssues : otherIssues.slice(0, 3);
  const hidden = otherIssues.length - 3;
  const hasMoreData = devices?.data || parameters?.data || results?.data || audit?.data;
  const hasOtherError = devices?.error || labs?.error || results?.error || reagents?.error;

  return (
    <div className="warta-overview">
      <div className="warta-overview-intro">
        <div className="warta-overview-inner warta-overview-intro-content">
          <div>
            <p className="warta-overview-date">{fullDate.format(new Date())}</p>
            <h1>Przegląd</h1>
          </div>
          <div className="warta-overview-scope">
            <FlaskConical aria-hidden />
            <select
              aria-label="Pracownia"
              value={selectedLab ? String(selectedLab.id) : ""}
              onChange={(event) => {
                setLabId(event.target.value);
                setExpanded(false);
              }}
            >
              <option value="">Wszystkie pracownie</option>
              {availableLabs.map((lab) => (
                <option key={lab.id} value={String(lab.id)}>
                  {lab.name}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden />
          </div>
        </div>
      </div>

      <section
        className="warta-overview-inner warta-overview-attention"
        aria-labelledby="attention-title"
      >
        <div className="warta-overview-attention-heading">
          <h2 id="attention-title">Wymaga uwagi</h2>
          {hidden > 0 && (
            <button
              type="button"
              className="warta-overview-link warta-overview-toggle"
              aria-expanded={expanded}
              aria-controls="attention-issues"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Zwiń listę" : `Pozostałe (${hidden})`}
              <ChevronDown aria-hidden />
            </button>
          )}
        </div>
        {hasOtherError && <Message>{hasOtherError}</Message>}
        {!schedule?.data && <Loading state={schedule} />}
        {schedule?.data &&
          !focus &&
          (can("result:read") && !results?.data && !results?.error ? (
            <Loading state={results} />
          ) : (
            <p className="warta-overview-empty">Brak spraw wymagających uwagi.</p>
          ))}
        {focus && (
          <div className="warta-overview-issues">
            <article className="warta-overview-feature" aria-label="Najpilniejsza sprawa">
              <p className="warta-overview-feature-status">
                <focus.icon aria-hidden />
                {focus.status}
              </p>
              <h3>{focus.name}</h3>
              {focus.detail && <p>{focus.detail}</p>}
              <button className="warta-overview-primary" type="button" onClick={focus.open}>
                {focus.label}
                <ArrowRight aria-hidden />
              </button>
              {focus.calibration && (
                <CalibrationEntry
                  key={focus.calibration.id}
                  token={token}
                  equipmentId={focus.calibration.id}
                  name={focus.calibration.name}
                  after={() => setRevision((value) => value + 1)}
                >
                  <button type="button" className="warta-overview-link warta-overview-certificate">
                    <FileText aria-hidden />
                    Zarejestruj świadectwo
                    <ArrowRight aria-hidden />
                  </button>
                </CalibrationEntry>
              )}
            </article>
            <div className="warta-overview-list">
              <div className="warta-overview-column-labels" aria-hidden>
                <span>Sprawa</span>
                <span>Status</span>
              </div>
              <ul id="attention-issues">
                {[focus, ...visibleIssues].map((issue) => (
                  <li
                    key={issue.key}
                    className={issue === focus ? "warta-overview-focus-row" : undefined}
                  >
                    <button type="button" onClick={issue.open}>
                      <span className="warta-overview-issue-main">
                        <strong>{issue.name}</strong>
                        {issue.detail && <span>{issue.detail}</span>}
                      </span>
                      <span className={`warta-overview-issue-status is-${issue.tone}`}>
                        {issue.status}
                      </span>
                      <span
                        className={`warta-overview-issue-status warta-overview-mobile-status is-${issue.tone}`}
                      >
                        {[issue.detail, issue.status].filter(Boolean).join(" · ")}
                      </span>
                      <ChevronRight aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="warta-overview-calendar" aria-labelledby="timeline-title">
        <div className="warta-overview-inner">
          <div className="warta-overview-calendar-heading">
            <h2 id="timeline-title">Najbliższe terminy</h2>
            <button
              type="button"
              className="warta-overview-link"
              onClick={() => onNavigate("schedule")}
            >
              <span>Harmonogram</span>
              <ArrowRight aria-hidden />
            </button>
          </div>
          {schedule?.data &&
            (upcoming.length > 0 ? (
              <ul>
                {upcoming.slice(0, 2).map((row) => {
                  const device = scheduleDevice(row, deviceRows);
                  const kind = isDueKind(row.kind) ? dueKindLabel(row.kind) : row.kind;
                  return (
                    <li key={`${row.kind}-${row.ref_type}-${row.ref_id}`}>
                      <button type="button" onClick={() => openSchedule(row)}>
                        <span className="warta-overview-event-date">{scheduleDue(row)}</span>
                        <span className="warta-overview-issue-main">
                          <strong>
                            {row.kind === "CALIBRATION" && device ? device.name : row.label}
                          </strong>
                          <span>
                            {[row.kind === "CALIBRATION" ? device?.code : undefined, kind]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <ChevronRight aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="warta-overview-empty">Brak nadchodzących terminów.</p>
            ))}
        </div>
      </section>

      {hasMoreData && (
        <details className="warta-overview-inner warta-overview-more">
          <summary>Wyposażenie, wyniki i historia</summary>
          <div className="grid gap-4 xl:grid-cols-2">
            {devices?.data && labs?.data && (
              <EquipmentBoard devices={visibleDevices} labs={availableLabs} onOpen={onOpenDevice} />
            )}
            {parameters?.data && !selectedLab && (
              <ResultChart
                token={token}
                parameters={options(parameters.data.filter((row) => row.active === true))}
                preferred={preferred}
                revision={0}
              />
            )}
            {results?.data && <OutOfRange rows={flagged} onShowAll={() => onNavigate("results")} />}
            {audit?.data && !selectedLab && (
              <RecentEntries
                rows={audit.data}
                users={users?.data ?? emptyRecords}
                onShowAll={() => onNavigate("audit")}
              />
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/** Attention first, then the rest, as on a control-room annunciator. */
const boardOrder = ["OVERDUE", "NO_DATA", "DUE_SOON", "OK", "WITHDRAWN", "NOT_REQUIRED"];

function EquipmentBoard({
  devices,
  labs,
  onOpen,
}: {
  devices: Device[];
  labs: Lab[];
  onOpen: (publicId: string) => void;
}) {
  const [focus, setFocus] = useState<string>();
  const counts = new Map<string, number>();
  for (const device of devices) {
    counts.set(device.status, (counts.get(device.status) ?? 0) + 1);
  }
  const supervised = devices.filter(
    ({ status }) => status !== "WITHDRAWN" && status !== "NOT_REQUIRED",
  );
  const current = supervised.filter(({ status }) => status === "OK").length;
  const groups = labs
    .map((lab) => ({ lab, items: devices.filter((device) => device.lab_id === lab.id) }))
    .filter(({ items }) => items.length > 0);
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <CardTitle>Tablica wyposażenia</CardTitle>
          <CardDescription>
            Jedno pole to jedno urządzenie. Kliknij pole, aby otworzyć kartę.
          </CardDescription>
        </div>
        <p className="text-sm text-muted-foreground">
          Ważne wzorcowanie:{" "}
          <strong className="text-base font-bold text-brand-navy-ink tabular-nums">
            {current} z {supervised.length}
          </strong>
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <fieldset className="flex flex-wrap gap-2" aria-label="Wyróżnij urządzenia w stanie">
          {boardOrder
            .filter((status) => counts.has(status))
            .map((status) => (
              <button
                key={status}
                type="button"
                aria-label={`${equipmentStatusLabel(status)}: ${counts.get(status)}`}
                aria-pressed={focus === status}
                onClick={() => setFocus(focus === status ? undefined : status)}
                className="flex items-center gap-2 rounded-sm border bg-card px-3 py-2 text-left outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-brand-navy aria-pressed:bg-accent"
              >
                <span className="text-sm font-bold text-brand-navy-ink tabular-nums">
                  {counts.get(status)}
                </span>
                <Status value={status} />
              </button>
            ))}
        </fieldset>
        {groups.map(({ lab, items }) => (
          <section key={lab.id} aria-label={`Pracownia ${lab.name}`}>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-brand-navy-ink">
              <span className="rounded-sm bg-brand-navy px-1.5 text-xs leading-5 text-white">
                {lab.code}
              </span>
              {lab.name}
            </h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
              {items.map((device) => {
                const state = equipmentStatusLabel(device.status);
                return (
                  <li key={device.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(device.public_id)}
                      title={`${device.code} ${device.name}: ${state}`}
                      aria-label={`${device.code} ${device.name}: ${state}`}
                      className={cn(
                        "flex min-h-20 w-full flex-col gap-1 rounded-sm border bg-card px-2 py-1.5 text-left text-brand-navy-ink outline-none hover:border-brand-navy focus-visible:ring-3 focus-visible:ring-ring/60",
                        focus === device.status && "border-brand-navy bg-accent",
                      )}
                    >
                      <span className="flex w-full items-baseline justify-between gap-1">
                        <span className="text-sm font-bold tabular-nums">{device.code}</span>
                        {device.next_due_month !== null && (
                          <span className="text-[11px] tabular-nums opacity-85">
                            {formatMonth(device.next_due_month)}
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-xs leading-tight text-muted-foreground">
                        {device.name}
                      </span>
                      <Status value={device.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

const outOfRangeColumns: Columns = [
  ["sample_label", "Próbka"],
  ["parameter_name", "Parametr"],
  [
    "reading",
    "Wynik",
    (value) => <span className="font-semibold text-status-alarm-ink">{textValue(value)}</span>,
  ],
  ["range", "Zakres wpisu"],
  ["day", "Data"],
  ["review", "Weryfikacja", (value) => <ResultReviewStatus value={value} />],
];

function nullable(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Display-ready copy of a result row: value with unit, entry range, day and review state. */
function outOfRangeRow(row: ApiRecord): ApiRecord {
  const unit = textValue(row.unit, "");
  return {
    id: row.id,
    sample_label: row.sample_label,
    parameter_name: row.parameter_name,
    reading: `${formatDecimal(textValue(row.value))} ${unit}`.trim(),
    range: formatRange(nullable(row.min_snapshot), nullable(row.max_snapshot), unit),
    day: formatDate(textValue(row.created_at).slice(0, 10)),
    review: row.review_decision ?? "PENDING",
  };
}

function OutOfRange({ rows, onShowAll }: { rows: ApiRecord[]; onShowAll: () => void }) {
  const latest = useMemo(() => rows.slice(0, 6).map(outOfRangeRow), [rows]);
  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>Wyniki poza zakresem</CardTitle>
          <CardDescription>Ostatnie pomiary, które przekroczyły zakres wpisu.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onShowAll}>
          Wyniki badań
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Wszystkie wpisane wyniki mieszczą się w zakresie.
          </p>
        ) : (
          <Rows columns={outOfRangeColumns} rows={latest} />
        )}
      </CardContent>
    </Card>
  );
}

const entryTime = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function RecentEntries({
  rows,
  users,
  onShowAll,
}: {
  rows: AuditRow[];
  users: ApiRecord[];
  onShowAll: () => void;
}) {
  const names = new Map(users.map((user) => [Number(user.id), textValue(user.full_name)]));
  const entries = rows.filter((row) => row.action !== "login").slice(0, 8);
  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>Ostatnie wpisy</CardTitle>
          <CardDescription>Każda zmiana zostaje w historii.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onShowAll}>
          Historia zmian
        </Button>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nie ma jeszcze zapisanych zmian.</p>
        ) : (
          <ol className="grid grid-cols-[minmax(0,1fr)]">
            {entries.map((row) => {
              const { title, subject } = describeAudit(row);
              const author = row.user_id === null ? undefined : names.get(row.user_id);
              return (
                <li key={row.id} className="border-b py-2.5 first:pt-0 last:border-0 last:pb-0">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold text-brand-navy-ink">{title}</span>
                    <time
                      dateTime={row.at}
                      className="shrink-0 text-xs text-muted-foreground tabular-nums"
                    >
                      {entryTime.format(new Date(row.at))}
                    </time>
                  </p>
                  <p className="truncate text-[13px]">{subject}</p>
                  {author !== undefined && (
                    <p className="text-xs text-muted-foreground">{author}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
