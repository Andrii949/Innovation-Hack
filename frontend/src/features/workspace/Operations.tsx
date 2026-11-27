import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  api,
  type ApiRecord,
  apiVoid,
  errorMessage,
  objectValue,
  textValue,
} from "@/api/workspaceClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { enablePushNotifications } from "@/platform/push";
import { isNativeApp } from "@/platform/server";

import { apiSave, Status } from "./Equipment";
import {
  Action,
  choice,
  type Columns,
  Control,
  type Field,
  Loading,
  options,
  Rows,
  selectStyle,
  today,
  useApi,
  type WorkspaceProps,
} from "./shared";

const kinds = choice(
  ["CALIBRATION", "Wzorcowanie"],
  ["CHECK", "Sprawdzenie"],
  ["LOT_EXPIRY", "Ważność partii"],
  ["STOCK_COUNT", "Spis odczynników"],
  ["LOW_STOCK", "Niski stan"],
);

export function Schedule({ token }: WorkspaceProps) {
  const [lab, setLab] = useState("");
  const [kind, setKind] = useState("");
  const [all, setAll] = useState(false);
  const query = new URLSearchParams({ include_ok: String(all) });
  if (lab) {
    query.set("lab_id", lab);
  }
  if (kind) {
    query.set("kind", kind);
  }
  const labs = useApi<ApiRecord[]>("/labs", token);
  const state = useApi<ApiRecord[]>(`/schedule?${query}`, token);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Harmonogram</CardTitle>
        <CardDescription>Najbliższe terminy i zadania pracowni.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Control label="Pracownia" htmlFor="schedule-lab">
            <select
              id="schedule-lab"
              className={selectStyle}
              value={lab}
              onChange={(event) => setLab(event.currentTarget.value)}
            >
              <option value="">Wszystkie dostępne</option>
              {options(labs?.data ?? []).map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Control>
          <Control label="Rodzaj zadania" htmlFor="schedule-kind">
            <select
              id="schedule-kind"
              className={selectStyle}
              value={kind}
              onChange={(event) => setKind(event.currentTarget.value)}
            >
              <option value="">Wszystkie</option>
              {kinds.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Control>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={all}
              onChange={(event) => setAll(event.currentTarget.checked)}
            />
            Pokaż aktualne
          </label>
        </div>
        {state?.data ? (
          <Rows rows={state.data} columns={scheduleColumns} />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

const reagentFields: Field[] = [
  { key: "name", label: "Nazwa", required: true },
  {
    key: "kind",
    label: "Rodzaj",
    type: "options",
    options: choice(["REAGENT", "Odczynnik"], ["CRM", "Certyfikowany materiał odniesienia (CRM)"]),
  },
  { key: "unit", label: "Jednostka stanu", required: true },
  { key: "min_stock", label: "Próg niskiego stanu", clear: true },
  { key: "stock_count_interval_days", label: "Cykl spisu (dni)", type: "number" },
  {
    key: "expiry_lead_months",
    label: "Wyprzedzenie powiadomienia o ważności (miesiące)",
    type: "number",
  },
  { key: "active", label: "Aktywny", type: "boolean" },
];
const lotFields: Field[] = [
  { key: "lot_no", label: "Numer partii", required: true },
  { key: "received_on", label: "Data przyjęcia", type: "date", required: true },
  { key: "expiry_date", label: "Data ważności", type: "date", required: true },
  { key: "quantity", label: "Ilość", required: true },
];
const stockFields: Field[] = [
  { key: "counted_on", label: "Data spisu", type: "date", required: true },
  { key: "quantity", label: "Aktualna ilość", required: true },
];

const disposeLotFields: Field[] = [
  {
    key: "disposed_on",
    label: "Data utylizacji",
    type: "date",
    required: true,
  },
];

export function Reagents({ token, permissions }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<number>();
  const after = () => setRevision((value) => value + 1);
  const state = useApi<ApiRecord[]>("/reagents", token, revision);
  const labs = useApi<ApiRecord[]>("/labs", token);
  const current = state?.data?.find((row) => row.id === selected);
  const admin = permissions.includes("reagent:write");
  const stock = permissions.includes("stock:write");
  const lots = useMemo(
    () => (Array.isArray(current?.lots) ? current.lots.map(objectValue) : []),
    [current],
  );
  const createReagentFields = useMemo<Field[]>(
    () => [
      {
        key: "lab_id",
        label: "Pracownia",
        type: "options",
        options: options(labs?.data ?? []),
        numeric: true,
        required: true,
      },
      ...reagentFields,
    ],
    [labs],
  );
  const stockInitial = useMemo(() => ({ counted_on: today() }), []);
  const lotInitial = useMemo(() => ({ received_on: today() }), []);
  const disposeInitial = useMemo(() => ({ disposed_on: today() }), []);
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
          <div>
            <CardTitle>Odczynniki i CRM</CardTitle>
            <CardDescription>
              CRM to certyfikowany materiał odniesienia. Tu sprawdzisz zapasy i ważność partii.
            </CardDescription>
          </div>
          {admin && (
            <Action
              label="Dodaj odczynnik lub CRM"
              fields={createReagentFields}
              save={apiSave("/reagents", token, "POST")}
              primary
              after={after}
            />
          )}
        </CardHeader>
        <CardContent>
          {state?.data ? (
            <Rows
              rows={state.data}
              columns={reagentColumns}
              renderAction={(row) => (
                <>
                  <Button variant="outline" size="sm" onClick={() => setSelected(Number(row.id))}>
                    Partie
                  </Button>
                  {admin && (
                    <Action
                      label="Edytuj"
                      fields={reagentFields}
                      initial={row}
                      save={apiSave(`/reagents/${Number(row.id)}`, token, "PATCH")}
                      after={after}
                    />
                  )}
                  {stock && row.active === true && (
                    <Action
                      label="Zapisz stan"
                      fields={stockFields}
                      initial={stockInitial}
                      save={apiSave(`/reagents/${Number(row.id)}/stock-counts`, token, "POST")}
                      after={after}
                    />
                  )}
                </>
              )}
            />
          ) : (
            <Loading state={state} />
          )}
        </CardContent>
      </Card>
      {current && (
        <Card>
          <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
            <div>
              <CardTitle>Partie · {textValue(current.name)}</CardTitle>
              <CardDescription>Daty przyjęcia, ważności i utylizacji.</CardDescription>
            </div>
            {admin && (
              <Action
                label="Dodaj partię"
                fields={lotFields}
                initial={lotInitial}
                save={apiSave(`/reagents/${Number(current.id)}/lots`, token, "POST")}
                after={after}
              />
            )}
          </CardHeader>
          <CardContent>
            <Rows
              rows={lots}
              columns={lotColumns}
              renderAction={(row) =>
                admin &&
                row.disposed_on == null && (
                  <Action
                    label="Zarejestruj utylizację"
                    fields={disposeLotFields}
                    initial={disposeInitial}
                    save={apiSave(`/lots/${Number(row.id)}`, token, "PATCH")}
                    after={after}
                  />
                )
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function Notifications({ token, after }: WorkspaceProps & { after: () => void }) {
  const [revision, setRevision] = useState(0);
  const [pushBusy, setPushBusy] = useState(false);
  const state = useApi<ApiRecord[]>("/notifications", token, revision);
  function changed() {
    setRevision((value) => value + 1);
    after();
  }
  async function configurePush() {
    setPushBusy(true);
    try {
      const result = await enablePushNotifications((payload) =>
        apiVoid("/devices", token, "POST", payload),
      );
      if (result.status === "registered") {
        toast.success("Powiadomienia na telefon są włączone.");
      } else {
        toast.info(
          result.status === "denied"
            ? "Brak zgody na powiadomienia."
            : "Powiadomienia push są niedostępne w tej wersji aplikacji.",
        );
      }
    } catch (failure) {
      toast.error(errorMessage(failure));
    } finally {
      setPushBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
        <div>
          <CardTitle>Powiadomienia</CardTitle>
          <CardDescription>Terminy, przekroczenia i gotowe raporty.</CardDescription>
        </div>
        {isNativeApp() && (
          <Button size="sm" variant="outline" disabled={pushBusy} onClick={configurePush}>
            Włącz push na telefonie
          </Button>
        )}
        {state?.data?.some((row) => row.read_at == null) && (
          <Action
            label="Oznacz wszystkie jako przeczytane"
            description="Zatwierdź odczyt wszystkich powiadomień na koncie."

            save={() => api("/notifications/read-all", token, "POST")}
            after={changed}
          />
        )}
      </CardHeader>
      <CardContent>
        {state?.data ? (
          <Rows
            rows={state.data}
            columns={notificationColumns}
            renderAction={(row) =>
              row.read_at == null && (
                <Action
                  label="Oznacz jako przeczytane"
                  description={textValue(row.title)}

                  save={() => api(`/notifications/${Number(row.id)}/read`, token, "POST")}
                  after={changed}
                />
              )
            }
          />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

export function CalibrationPlans({ token, permissions }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const after = () => setRevision((value) => value + 1);
  const state = useApi<ApiRecord[]>("/calibration-plans", token, revision);
  const devices = useApi<ApiRecord[]>(
    permissions.includes("calibration:write") ? "/equipment" : null,
    token,
  );
  const optionsList = useMemo(
    () =>
      (devices?.data ?? [])
        .filter((device) => device.withdrawn_at == null && device.calibration_required === true)
        .map((device) => ({
          value: textValue(device.id),
          label: `${textValue(device.code)} · ${textValue(device.name)}`,
        })),
    [devices],
  );
  const fields = useMemo<Field[]>(
    () => [
      {
        key: "equipment_id",
        label: "Urządzenie",
        type: "options",
        numeric: true,
        options: optionsList,
        required: true,
      },
      { key: "dispatch_on", label: "Planowana wysyłka", type: "date", required: true },
      { key: "return_on", label: "Planowany powrót", type: "date", required: true },
      { key: "note", label: "Uwagi", type: "note" },
    ],
    [optionsList],
  );
  const editFields = useMemo(() => fields.filter(({ key }) => key !== "equipment_id"), [fields]);
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
        <div>
          <CardTitle>Plan wzorcowań</CardTitle>
          <CardDescription>
            Wysyłka urządzeń do firmy wzorcującej i zatwierdzenia kierownika.
          </CardDescription>
        </div>
        {permissions.includes("calibration:write") && (
          <Action
            label="Dodaj do planu"
            fields={fields}
            save={apiSave("/calibration-plans", token, "POST")}
            after={after}
            primary
          />
        )}
      </CardHeader>
      <CardContent>
        {state?.data ? (
          <Rows
            rows={state.data}
            columns={calibrationPlanColumns}
            renderAction={(row) => (
              <>
                {row.approved_at == null && permissions.includes("calibration:write") && (
                  <Action
                    label="Edytuj plan wysyłki"
                    fields={editFields}
                    initial={row}
                    save={apiSave(`/calibration-plans/${Number(row.id)}`, token, "PATCH")}
                    after={after}
                  />
                )}
                {row.approved_at == null && permissions.includes("calibration:approve") && (
                  <Action
                    label="Zatwierdź plan wzorcowania"
                    submitLabel="Zatwierdź plan"
                    description={`Zatwierdzasz plan wysyłki urządzenia: ${textValue(row.equipment)}.`}

                    save={() => api(`/calibration-plans/${Number(row.id)}/approve`, token, "POST")}
                    after={after}
                  />
                )}
              </>
            )}
          />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

const scheduleColumns: Columns = [
  ["label", "Pozycja"],
  [
    "kind",
    "Rodzaj",
    (value) => kinds.find(({ value: key }) => key === value)?.label ?? textValue(value),
  ],
  ["due", "Termin"],
  ["status", "Status", (value) => <Status value={value} />],
];

const reagentColumns: Columns = [
  ["name", "Nazwa"],
  ["kind", "Rodzaj", (value) => (value === "CRM" ? "CRM" : "Odczynnik")],
  ["lab_code", "Pracownia"],
  ["current_stock", "Stan fizyczny"],
  ["usable_stock_estimate", "Ważny CRM (szacunek)"],
  ["recommended_lot_no", "Partia do użycia w pierwszej kolejności"],
  ["unit", "Jednostka"],
  ["nearest_expiry", "Najbliższa ważność"],
  ["low_stock", "Stan zapasu", (value) => (value ? <Status value="LOW" /> : "—")],
];

const lotColumns: Columns = [
  ["lot_no", "Numer partii"],
  ["quantity", "Ilość"],
  ["received_on", "Przyjęto"],
  ["expiry_date", "Ważna do"],
  ["disposed_on", "Utylizacja"],
  ["status", "Status", (value) => <Status value={value} />],
];

const notificationColumns: Columns = [
  ["title", "Powiadomienie"],
  ["due", "Termin"],
  ["created_at", "Dodano", (value) => textValue(value).slice(0, 10)],
  ["read_at", "Stan", (value) => (value == null ? "Nowe" : "Przeczytane")],
];

const calibrationPlanColumns: Columns = [
  ["equipment", "Urządzenie"],
  ["dispatch_on", "Wysyłka"],
  ["return_on", "Powrót"],
  ["available_devices", "Najmniej dostępnych zastępstw"],
  ["warning", "Konflikt dostępności"],
  ["approved_by_name", "Zatwierdził", (value) => (value == null ? "Oczekuje" : textValue(value))],
  ["note", "Uwagi"],
];
