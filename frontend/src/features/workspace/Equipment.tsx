import { ArrowLeft, Download, ExternalLink, QrCode, ScanLine } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  api,
  type ApiRecord,
  download,
  errorMessage,
  objectValue,
  textValue,
} from "@/api/workspaceClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isValidPublicId, parseEquipmentUrl } from "@/lib/qr";
import { isNfcAvailable } from "@/platform/nfc";
import { canScanQr, scanEquipment } from "@/platform/scan";

import { CalibrationEntry } from "./CalibrationEntry";
import {
  Action,
  choice,
  type Columns,
  type Field,
  Loading,
  Message,
  options,
  Rows,
  today,
  useApi,
  type WorkspaceProps,
} from "./shared";

const statusLabels: Record<string, string> = {
  OK: "Aktualne",
  DUE_SOON: "Zbliża się termin",
  OVERDUE: "Po terminie",
  NO_DATA: "Brak wpisu",
  WITHDRAWN: "Wycofane",
  NOT_REQUIRED: "Niewymagane",
  LOW: "Niski stan",
  COUNT_DUE: "Spis do wykonania",
};

export function Status({ value }: { value: unknown }) {
  const key = textValue(value);
  return (
    <Badge
      variant={key === "OVERDUE" || key === "WITHDRAWN" ? "destructive" : "outline"}
      className={key === "OK" ? "border-brand-lime bg-brand-lime-soft text-brand-navy" : undefined}
    >
      {statusLabels[key] ?? key}
    </Badge>
  );
}

type CheckPlan = ApiRecord & { id: number; name: string; fields: ApiRecord[]; active: boolean };
type EquipmentCard = ApiRecord & {
  id: number;
  name: string;
  code: string;
  qr_url: string;
  can_write: boolean;
  can_write_result: boolean;
  check_plans: CheckPlan[];
};
type Calibration = ApiRecord & { id: number; points: ApiRecord[]; attachment_ids: number[] };

const mode = choice(["EXTERNAL", "Zewnętrzne"], ["ON_SITE", "Na miejscu"]);
export const calibrationFields: Field[] = [
  { key: "calibration_required", label: "Wymaga wzorcowania", type: "boolean" },
  { key: "calibration_interval_months", label: "Cykl (miesiące)", type: "number", clear: true },
  { key: "calibration_mode", label: "Tryb wzorcowania", type: "options", options: mode },
  { key: "lead_months", label: "Wyprzedzenie przypomnienia (miesiące)", type: "number" },
  { key: "acceptance_criteria", label: "Kryteria akceptacji", type: "note" },
  { key: "notes", label: "Uwagi", type: "note" },
];

export const modelFields: Field[] = [
  { key: "name", label: "Nazwa" },
  { key: "category", label: "Kategoria" },
  { key: "manufacturer", label: "Producent" },
  { key: "model", label: "Model" },
  { key: "software_version", label: "Wersja oprogramowania" },
];
const deviceFields: Field[] = [
  { key: "number", label: "Numer ewidencyjny", required: true },
  ...modelFields,
  { key: "serial_no", label: "Numer seryjny" },
  { key: "location", label: "Lokalizacja" },
  ...calibrationFields,
];
const withdrawFields: Field[] = [
  { key: "reason", label: "Uzasadnienie", required: true, type: "note" },
];

export function apiSave(path: string, token: string, method: string) {
  return (data: unknown) => api(path, token, method, data);
}

export function DownloadButton({
  token,
  path,
  filename,
  label,
}: {
  token: string;
  path: string;
  filename: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await download(path, token, filename);
    } catch (failure) {
      toast.error(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy}>
      <Download />
      {busy ? "Pobieranie…" : label}
    </Button>
  );
}

export function Equipment({
  token,
  permissions,
  publicId,
  onPublicId,
  onResults,
}: WorkspaceProps & {
  publicId: string | null;
  onPublicId: (id: string | null) => void;
  onResults: (id?: number) => void;
}) {
  const [id, setId] = useState<number>();
  const [query, setQuery] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const scanController = useRef<AbortController | null>(null);
  const [revision, setRevision] = useState(0);
  const after = () => setRevision((previous) => previous + 1);
  const edit = permissions.includes("equipment:write");
  const results = permissions.includes("result:write");
  const labs = useApi<ApiRecord[]>("/labs", token);
  const catalog = useApi<ApiRecord[]>(edit ? "/equipment-catalog" : null, token);
  const collection = useApi<ApiRecord[]>(
    `/equipment?q=${encodeURIComponent(query)}`,
    token,
    revision,
  );
  const path =
    publicId !== null
      ? `/equipment/by-qr/${publicId}`
      : id === undefined
        ? null
        : `/equipment/${id}`;
  const details = useApi<EquipmentCard>(path, token, revision);
  const scopedFields = useMemo<Field[]>(
    () => [
      {
        key: "lab_id",
        label: "Pracownia",
        type: "options",
        options: options(labs?.data ?? []),
        numeric: true,
        required: true,
      },
      ...deviceFields,
    ],
    [labs],
  );
  const createEquipmentFields = useMemo<Field[]>(
    () => [
      {
        key: "catalog_id",
        label: "Model z katalogu (opcjonalnie)",
        type: "options",
        numeric: true,
        options: options(catalog?.data ?? [], "display_label"),
      },
      ...scopedFields.filter(
        (field) => field.key !== "calibration_interval_months" && field.key !== "name",
      ),
      { key: "name", label: "Nazwa (wymagana przy wpisie bez katalogu)" },
      { key: "calibration_interval_months", label: "Cykl (miesiące)", type: "number" },
      { key: "last_calibrated_month", label: "Ostatnie wzorcowanie", type: "month" },
    ],
    [catalog, scopedFields],
  );
  function lookup(value: string) {
    const raw = value.trim();
    const scanned = parseEquipmentUrl(raw) ?? (isValidPublicId(raw) ? raw : null);
    if (scanned === null) {
      setScanError("Wklej link z etykiety QR / NFC lub wpisz identyfikator urządzenia.");
      return;
    }
    setScanError("");
    onPublicId(scanned);
  }
  async function scan(preferNfc: boolean) {
    const controller = new AbortController();
    scanController.current = controller;
    setScanBusy(true);
    setScanError("");
    try {
      const outcome = await scanEquipment({ preferNfc, signal: controller.signal });
      if (outcome.status === "ok") {
        onPublicId(outcome.publicId);
      } else if (outcome.status !== "cancelled") {
        setScanError(outcome.message);
      }
    } catch (failure) {
      setScanError(errorMessage(failure));
    } finally {
      scanController.current = null;
      setScanBusy(false);
    }
  }
  if (path !== null) {
    return (
      <div className="grid gap-4">
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start"
          onClick={() => {
            setId(undefined);
            onPublicId(null);
          }}
        >
          <ArrowLeft />
          Wróć do rejestru
        </Button>
        {details?.data ? (
          <EquipmentDetails
            key={details.data.id}
            device={details.data}
            token={token}
            permissions={permissions}
            fields={scopedFields}
            after={after}
            revision={revision}
            onResults={onResults}
          />
        ) : (
          <Loading state={details} />
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="size-5" />
            Otwórz kartę z etykiety
          </CardTitle>
          <CardDescription>
            Zbliż telefon do tagu NFC albo zeskanuj QR aparatem. Możesz też wkleić link z etykiety.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              lookup(textValue(new FormData(event.currentTarget).get("tag"), ""));
            }}
          >
            <Input
              name="tag"
              aria-label="Link lub identyfikator etykiety"
              placeholder="Wklej link lub identyfikator etykiety"
              className="min-w-56 flex-1"
              required
            />
            <Button type="submit">Otwórz kartę</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {isNfcAvailable() && (
              <Button
                variant="outline"
                type="button"
                disabled={scanBusy}
                onClick={() => scan(true)}
              >
                <ScanLine />
                Odczytaj NFC
              </Button>
            )}
            {canScanQr() && (
              <Button
                variant="outline"
                type="button"
                disabled={scanBusy}
                onClick={() => scan(false)}
              >
                <QrCode />
                Skanuj QR
              </Button>
            )}
            {scanBusy && (
              <Button variant="ghost" type="button" onClick={() => scanController.current?.abort()}>
                Anuluj odczyt
              </Button>
            )}
          </div>
          {scanError && <Message>{scanError}</Message>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
          <div>
            <CardTitle>Rejestr urządzeń</CardTitle>
            <CardDescription>Daty wzorcowania, terminy i karty urządzeń.</CardDescription>
          </div>
          {edit && (
            <Action
              label="Dodaj urządzenie"
              primary
              fields={createEquipmentFields}
              save={apiSave("/equipment", token, "POST")}
              after={after}
            />
          )}
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            aria-label="Szukaj urządzeń"
            placeholder="Szukaj po nazwie, kodzie lub numerze seryjnym"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {collection?.data ? (
            <Rows
              rows={collection.data}
              columns={registerColumns}
              renderAction={(row) => (
                <Button variant="outline" size="sm" onClick={() => setId(Number(row.id))}>
                  Otwórz kartę
                </Button>
              )}
            />
          ) : (
            <Loading state={collection} />
          )}
          {results && (
            <Button variant="link" className="justify-self-start" onClick={() => onResults()}>
              Przejdź do wyników badań
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EquipmentDetails({
  device,
  token,
  permissions,
  fields,
  revision,
  after,
  onResults,
}: WorkspaceProps & {
  device: EquipmentCard;
  fields: Field[];
  after: () => void;
  revision: number;
  onResults: (id?: number) => void;
}) {
  const path = `/equipment/${device.id}`;
  const write = permissions.includes("equipment:write");
  const calibrate = permissions.includes("calibration:write");
  const users = useApi<ApiRecord[]>(
    write && permissions.includes("users:write") ? "/users" : null,
    token,
  );
  const authorized = useApi<ApiRecord[]>(
    write ? `${path}/authorized-users` : null,
    token,
    revision,
  );
  const calibrations = useApi<Calibration[]>(`${path}/calibrations`, token, revision);
  const templates = useApi<ApiRecord[]>(write ? "/form-templates" : null, token);
  const allCheckPlans = useApi<CheckPlan[]>(write ? `${path}/check-plans` : null, token, revision);
  const [history, setHistory] = useState<number>();
  const [openedPlan, setOpenedPlan] = useState<number>();
  const planFields = useMemo<Field[]>(
    () => [
      { key: "name", label: "Nazwa sprawdzenia", required: true },
      { key: "interval_months", label: "Cykl (miesiące)", type: "number", required: true },
      { key: "lead_months", label: "Wyprzedzenie (miesiące)", type: "number" },
      {
        key: "form_template_id",
        label: "Szablon formularza",
        type: "options",
        options: options(templates?.data ?? []),
        numeric: true,
        required: true,
      },
      { key: "active", label: "Aktywny", type: "boolean" },
    ],
    [templates],
  );
  const authorizationFields = useMemo<Field[]>(
    () => [
      {
        key: "user_ids",
        label: "Upoważnieni użytkownicy",
        type: "many",
        numeric: true,
        options: options(users?.data ?? [], "full_name"),
      },
    ],
    [users],
  );
  const authorizationInitial = useMemo<ApiRecord>(
    () => ({ user_ids: authorized?.data?.map((user) => user.id) }),
    [authorized],
  );
  const withdrawn = typeof device.withdrawn_at === "string";
  const selectedCalibration = calibrations?.data?.find((entry) => entry.id === history);
  return (
    <>
      <Card className="border-t-4 border-t-brand-lime">
        <CardHeader className="gap-4 sm:flex sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-widest text-muted-foreground">
              {device.code}
            </p>
            <CardTitle className="text-2xl text-brand-navy">{device.name}</CardTitle>
            <CardDescription>
              {[device.manufacturer, device.model, device.location].filter(Boolean).join(" · ")}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {calibrate && (
              <CalibrationEntry
                token={token}
                equipmentId={device.id}
                name={device.name}
                after={after}
              />
            )}
            {device.can_write_result && (
              <Button variant="outline" onClick={() => onResults(device.id)}>
                Wpisz wynik badania
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-4 text-sm sm:grid-cols-4">
            {[
              ["last_calibrated_month", "Ostatnie wzorcowanie"],
              ["next_due_month", "Następne wzorcowanie"],
              ["serial_no", "Numer seryjny"],
            ].map(([key = "", label]) => (
              <div key={key}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-semibold">{textValue(device[key])}</dd>
              </div>
            ))}
            <div>
              <dt className="mb-1 text-muted-foreground">Stan</dt>
              <dd>
                <Status value={device.status} />
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton
              token={token}
              path={`${path}/history.pdf`}
              filename={`karta-${device.id}.pdf`}
              label="Karta i historia PDF"
            />
            <Button variant="outline" size="sm" asChild>
              <a href={device.qr_url} target="_blank" rel="noreferrer">
                <ExternalLink />
                Link QR / NFC
              </a>
            </Button>
            {write && (
              <>
                <Action
                  label="Edytuj urządzenie"
                  fields={fields}
                  initial={device}
                  save={apiSave(path, token, "PATCH")}
                  after={after}
                />
                <Action
                  label={withdrawn ? "Przywróć urządzenie" : "Wycofaj urządzenie"}
                  fields={withdrawFields}
                  save={apiSave(`${path}/${withdrawn ? "restore" : "withdraw"}`, token, "POST")}
                  after={after}
                />
                {authorized?.data && users?.data && (
                  <Action
                    label="Upoważnienia"
                    fields={authorizationFields}
                    initial={authorizationInitial}
                    save={apiSave(`${path}/authorized-users`, token, "PUT")}
                    after={after}
                  />
                )}
              </>
            )}
          </div>
          {device.acceptance_criteria != null && (
            <p className="text-sm">
              <strong>Kryteria akceptacji</strong> {textValue(device.acceptance_criteria)}
            </p>
          )}
          {device.notes != null && (
            <p className="text-sm">
              <strong>Uwagi</strong> {textValue(device.notes)}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Świadectwa i historia wzorcowań</CardTitle>
        </CardHeader>
        <CardContent>
          {calibrations?.data ? (
            <Rows
              rows={calibrations.data}
              columns={calibrationColumns}
              renderAction={(row) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistory(history === row.id ? undefined : Number(row.id))}
                >
                  {history === row.id ? "Zwiń" : "Szczegóły"}
                </Button>
              )}
            />
          ) : (
            <Loading state={calibrations} />
          )}
          {selectedCalibration && (
            <div className="mt-4 rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">Punkty wzorcowania</h3>
              <Rows rows={selectedCalibration.points} columns={pointColumns} />
              {selectedCalibration.note != null && (
                <p className="mt-2 text-sm">{textValue(selectedCalibration.note)}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedCalibration.attachment_ids.map((att) => (
                  <DownloadButton
                    key={att}
                    token={token}
                    path={`/attachments/${att}`}
                    filename=""
                    label={`Pobierz świadectwo #${att}`}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
          <div>
            <CardTitle>Sprawdzenia okresowe</CardTitle>
            <CardDescription>
              Wewnętrzne czynności zgodnie z planem danego urządzenia.
            </CardDescription>
          </div>
          {write && (
            <Action
              label="Dodaj plan sprawdzenia"
              fields={planFields}
              save={apiSave(`${path}/check-plans`, token, "POST")}
              after={after}
            />
          )}
        </CardHeader>
        <CardContent>
          <Rows
            rows={allCheckPlans?.data ?? device.check_plans}
            columns={checkPlanColumns}
            renderAction={(row) => (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenedPlan(openedPlan === row.id ? undefined : Number(row.id))}
                >
                  Historia sprawdzeń
                </Button>
                {write && (
                  <Action
                    label="Edytuj plan"
                    fields={planFields}
                    initial={row}
                    save={apiSave(`/check-plans/${Number(row.id)}`, token, "PATCH")}
                    after={after}
                  />
                )}
                {device.can_write && row.active === true && (
                  <CheckEntry token={token} row={row} after={after} />
                )}
              </>
            )}
          />
          {openedPlan !== undefined && (
            <CheckHistory token={token} id={openedPlan} revision={revision} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function CheckEntry({ token, row, after }: { token: string; row: ApiRecord; after: () => void }) {
  const specs = useMemo(
    () => (Array.isArray(row.fields) ? row.fields.map(objectValue) : []),
    [row.fields],
  );
  const measurements = useMemo<Field[]>(
    () =>
      specs.map((field) => ({
        key: `value:${textValue(field.key)}`,
        label: `${textValue(field.label)}${field.unit ? ` (${textValue(field.unit)})` : ""}`,
        type: field.type === "bool" ? "boolean" : field.type === "date" ? "date" : undefined,
        required: field.required === true,
        hint:
          field.min != null || field.max != null
            ? `Zakres: ${textValue(field.min)} – ${textValue(field.max)}`
            : undefined,
      })),
    [specs],
  );
  const entryFields = useMemo<Field[]>(
    () => [
      { key: "performed_on", label: "Data sprawdzenia", type: "date", required: true },
      ...measurements,
      { key: "note", label: "Uwagi", type: "note" },
    ],
    [measurements],
  );
  const entryInitial = useMemo<ApiRecord>(() => ({ performed_on: today() }), []);
  return (
    <Action
      label="Zapisz sprawdzenie"
      description={textValue(row.name)}
      fields={entryFields}
      initial={entryInitial}
      save={(data) =>
        api(`/check-plans/${Number(row.id)}/records`, token, "POST", {
          performed_on: data.performed_on,
          note: data.note,
          values: Object.fromEntries(
            Object.entries(data)
              .filter(([key]) => key.startsWith("value:"))
              .map(([key, value]) => [key.slice(6), value]),
          ),
        })
      }
      after={after}
    />
  );
}

function CheckHistory({ token, id, revision }: { token: string; id: number; revision: number }) {
  const state = useApi<ApiRecord[]>(`/check-plans/${id}/records`, token, revision);
  if (!state?.data) {
    return <Loading state={state} />;
  }
  return (
    <div className="mt-4 rounded-lg border p-3">
      <h3 className="mb-2 font-semibold">Historia sprawdzeń</h3>
      <Rows rows={state.data} columns={checkHistoryColumns} />
    </div>
  );
}

const registerColumns: Columns = [
  ["code", "Kod"],
  ["name", "Urządzenie"],
  ["last_calibrated_month", "Ostatnie wzorcowanie"],
  ["next_due_month", "Następny termin"],
  ["status", "Status", (value) => <Status value={value} />],
];

const calibrationColumns: Columns = [
  ["calibrated_month", "Miesiąc"],
  ["vendor", "Firma"],
  ["certificate_no", "Świadectwo"],
  ["result", "Decyzja"],
  ["next_due_month", "Termin z wpisu"],
];

const pointColumns: Columns = [
  ["point", "Punkt"],
  ["error", "Błąd"],
  ["uncertainty", "Niepewność"],
  ["unit", "Jednostka"],
];

const checkPlanColumns: Columns = [
  ["name", "Czynność"],
  ["last_performed_on", "Ostatnie sprawdzenie"],
  ["next_due_month", "Następny termin"],
  ["status", "Status", (value) => <Status value={value} />],
];

const checkHistoryColumns: Columns = [
  ["performed_on", "Data"],
  [
    "values",
    "Pomiary",
    (value) =>
      Object.entries(objectValue(value))
        .map(
          ([key, result]) =>
            `${key}: ${textValue(result, typeof result === "boolean" ? (result ? "Tak" : "Nie") : "—")}`,
        )
        .join(" · "),
  ],
  ["out_of_range", "Ocena", (value) => (value ? "Poza zakresem" : "W zakresie")],
  ["note", "Uwagi"],
];
