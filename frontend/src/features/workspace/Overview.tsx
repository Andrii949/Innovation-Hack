import { cn } from "cn";
import { useMemo, useState } from "react";

import { type ApiRecord, textValue } from "@/api/workspaceClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type AuditEntry, describeAudit } from "@/lib/audit";
import { formatDate, formatDecimal, formatRange } from "@/lib/format";
import { formatMonth } from "@/lib/months";
import { scheduleDetail, scheduleDevice } from "@/lib/overview";
import { dueKindLabel, isDueKind, isStatus, statusBadgeClass, statusDotClass } from "@/lib/status";

import { statusLabels } from "./Equipment";
import { ResultChart } from "./Results";
import { type Columns, Loading, options, Rows, useApi, type WorkspaceProps } from "./shared";

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
  label: string;
  due: string | null;
  status: string;
};
type AuditRow = AuditEntry & { id: number; at: string; user_id: number | null };
export type OverviewTarget = "schedule" | "reagents" | "results" | "audit";

const noDevices: Device[] = [];
const noRecords: ApiRecord[] = [];

export function Overview({
  token,
  permissions,
  onOpenDevice,
  onNavigate,
}: WorkspaceProps & {
  onOpenDevice: (publicId: string) => void;
  onNavigate: (section: OverviewTarget) => void;
}) {
  const can = (permission: string) => permissions.includes(permission);
  const devices = useApi<Device[]>("/equipment", token);
  const labs = useApi<Lab[]>("/labs", token);
  const schedule = useApi<DueRow[]>("/schedule", token);
  const results = useApi<ApiRecord[]>(can("result:read") ? "/test-results" : null, token);
  const parameters = useApi<ApiRecord[]>(can("report:read") ? "/test-parameters" : null, token);
  const audit = useApi<AuditRow[]>(can("audit:read") ? "/audit" : null, token);
  const users = useApi<ApiRecord[]>(can("users:write") ? "/users" : null, token);
  const flagged = useMemo(
    () => (results?.data ?? noRecords).filter((row) => row.in_range === false),
    [results],
  );
  const preferred = textValue((flagged[0] ?? results?.data?.[0])?.parameter_id, "");

  // Two columns on wide screens. Narrower, the columns dissolve (`contents`) and `order` puts the
  // to-do list right under the board, before the charts.
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <div className="contents xl:grid xl:min-w-0 xl:gap-4">
        <div className="order-1 min-w-0">
          {devices?.data && labs?.data ? (
            <EquipmentBoard devices={devices.data} labs={labs.data} onOpen={onOpenDevice} />
          ) : (
            <Loading state={devices ?? labs} />
          )}
        </div>
        {parameters?.data && (
          <div className="order-3 min-w-0">
            <ResultChart
              token={token}
              parameters={options(parameters.data.filter((row) => row.active === true))}
              preferred={preferred}
              revision={0}
            />
          </div>
        )}
        {results?.data && (
          <div className="order-4 min-w-0">
            <OutOfRange rows={flagged} onShowAll={() => onNavigate("results")} />
          </div>
        )}
      </div>
      <div className="contents xl:grid xl:min-w-0 xl:gap-4">
        <div className="order-2 min-w-0">
          {schedule?.data ? (
            <Attention
              rows={schedule.data}
              devices={devices?.data ?? noDevices}
              onOpenDevice={onOpenDevice}
              onNavigate={onNavigate}
            />
          ) : (
            <Loading state={schedule} />
          )}
        </div>
        {audit?.data && (
          <div className="order-5 min-w-0">
            <RecentEntries
              rows={audit.data}
              users={users?.data ?? noRecords}
              onShowAll={() => onNavigate("audit")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Attention first, then the rest, as on a control-room annunciator. */
const boardOrder = ["OVERDUE", "NO_DATA", "DUE_SOON", "OK", "WITHDRAWN", "NOT_REQUIRED"];

const tileTone: Record<string, string> = {
  OVERDUE: "border-status-alarm bg-status-alarm text-white",
  NO_DATA: "border-dashed border-status-alarm bg-status-alarm-soft text-status-alarm-ink",
  DUE_SOON: "border-status-due bg-status-due text-brand-navy-ink",
  OK: "border-border bg-card text-brand-navy-ink",
  WITHDRAWN: "border-transparent bg-status-idle-soft text-status-idle-ink",
  NOT_REQUIRED: "border-transparent bg-status-idle-soft text-status-idle-ink",
};

function lampClass(status: string) {
  return isStatus(status) ? statusDotClass(status) : "bg-status-idle";
}

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
                aria-label={`${statusLabels[status]}: ${counts.get(status)}`}
                aria-pressed={focus === status}
                onClick={() => setFocus(focus === status ? undefined : status)}
                className="flex min-w-[8.5rem] items-stretch gap-2.5 rounded-sm border bg-card py-1.5 pr-3 pl-1.5 text-left transition-colors outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-brand-navy aria-pressed:bg-accent"
              >
                <span aria-hidden className={cn("w-1 shrink-0 rounded-full", lampClass(status))} />
                <span>
                  <span className="block text-xl leading-tight font-bold text-brand-navy-ink tabular-nums">
                    {counts.get(status)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {statusLabels[status]}
                  </span>
                </span>
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
                const state = statusLabels[device.status] ?? device.status;
                return (
                  <li key={device.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(device.public_id)}
                      title={`${device.code} ${device.name}: ${state}`}
                      aria-label={`${device.code} ${device.name}: ${state}`}
                      className={cn(
                        "flex h-16 w-full flex-col justify-between rounded-sm border px-2 py-1.5 text-left transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                        tileTone[device.status] ?? tileTone.NOT_REQUIRED,
                        focus !== undefined && focus !== device.status && "opacity-20",
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-1">
                        <span className="text-sm font-bold tabular-nums">{device.code}</span>
                        {device.next_due_month !== null && (
                          <span className="text-[11px] tabular-nums opacity-85">
                            {formatMonth(device.next_due_month)}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs leading-tight opacity-90">
                        {device.name}
                      </span>
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

const urgent = new Set(["OVERDUE", "NO_DATA", "LOW"]);

function Attention({
  rows,
  devices,
  onOpenDevice,
  onNavigate,
}: {
  rows: DueRow[];
  devices: Device[];
  onOpenDevice: (publicId: string) => void;
  onNavigate: (section: OverviewTarget) => void;
}) {
  function open(row: DueRow) {
    const device = scheduleDevice(row, devices);
    if (device === undefined) {
      onNavigate(row.ref_type.startsWith("reagent") ? "reagents" : "schedule");
    } else {
      onOpenDevice(device.public_id);
    }
  }
  const pressing = useMemo(() => rows.filter((row) => urgent.has(row.status)), [rows]);
  const upcoming = useMemo(() => rows.filter((row) => !urgent.has(row.status)), [rows]);
  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>Wymaga działania</CardTitle>
          <CardDescription>Terminy z harmonogramu, od najpilniejszych.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNavigate("schedule")}>
          Harmonogram
        </Button>
      </CardHeader>
      <CardContent className="grid gap-5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Wszystkie terminy są aktualne.</p>
        ) : (
          <>
            <TaskGroup title="Pilne" rows={pressing} open={open} />
            <TaskGroup title="W najbliższym czasie" rows={upcoming} open={open} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TaskGroup({
  title,
  rows,
  open,
}: {
  title: string;
  rows: DueRow[];
  open: (row: DueRow) => void;
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section aria-label={title}>
      <h3 className="mb-2 flex items-center justify-between text-[13px] font-semibold text-brand-navy-ink">
        {title}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {rows.length}
        </span>
      </h3>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {rows.map((row) => {
          const detail = `${isDueKind(row.kind) ? dueKindLabel(row.kind) : row.kind}, ${scheduleDetail(row)}`;
          return (
            <li key={`${row.kind}-${row.ref_type}-${row.ref_id}`}>
              <button
                type="button"
                onClick={() => open(row)}
                aria-label={`${row.label}: ${statusLabels[row.status] ?? row.status}, ${detail}`}
                className="flex w-full items-stretch overflow-hidden rounded-sm bg-background text-left transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span aria-hidden className={cn("w-1 shrink-0", lampClass(row.status))} />
                <span className="min-w-0 flex-1 px-3 py-2">
                  <span className="block truncate text-[13px] font-semibold text-brand-navy-ink">
                    {row.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const reviewLabels: Record<string, string> = {
  PENDING: "Do weryfikacji",
  ACCEPTED: "Zaakceptowano",
  REPEAT: "Do powtórzenia",
};

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
  [
    "review",
    "Weryfikacja",
    (value) => (
      <span
        className={cn(
          "inline-flex rounded-sm border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap",
          statusBadgeClass(value === "ACCEPTED" ? "OK" : "DUE_SOON"),
        )}
      >
        {reviewLabels[textValue(value)] ?? textValue(value)}
      </span>
    ),
  ],
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
