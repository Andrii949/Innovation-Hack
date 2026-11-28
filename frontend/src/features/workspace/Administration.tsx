import { useMemo, useState } from "react";

import { api, type ApiRecord, textValue } from "@/api/workspaceClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeAudit } from "@/lib/audit";

import { apiSave, calibrationFields, modelFields } from "./Equipment";
import {
  Action,
  choice,
  type Columns,
  type Field,
  Loading,
  options,
  Rows,
  useApi,
  type WorkspaceProps,
} from "./shared";

const roleName: Record<string, string> = {
  admin: "Specjalista laboratoryjny",
  manager: "Kierownik laboratorium",
  worker: "Pracownik pracowni",
};

export function roleLabel(role: string) {
  return roleName[role] ?? role;
}

const catalogFields: Field[] = [
  ...modelFields.map((field) =>
    Object.assign({}, field, { required: field.key !== "software_version" }),
  ),
  { key: "suggested_lab_code", label: "Kod sugerowanej pracowni" },
  ...calibrationFields.filter((field) => field.key !== "calibration_interval_months"),
  { key: "calibration_interval_months", label: "Cykl (miesiące)", type: "number" },
  { key: "search_aliases", label: "Hasła wyszukiwania" },
  { key: "active", label: "Aktywny", type: "boolean" },
];

const labFields: Field[] = [
  { key: "code", label: "Kod pracowni", required: true },
  { key: "name", label: "Nazwa", required: true },
  { key: "active", label: "Aktywna", type: "boolean" },
];

const settingFields: Field[] = [
  {
    key: "equipment_lead_months_range",
    label: "Dozwolone wyprzedzenie wzorcowania [min, max]",
    type: "json",
    required: true,
  },
  {
    key: "check_lead_months_range",
    label: "Dozwolone wyprzedzenie sprawdzenia [min, max]",
    type: "json",
    required: true,
  },
  {
    key: "default_equipment_lead_months",
    label: "Domyślne wyprzedzenie wzorcowania (miesiące)",
    type: "number",
  },
  {
    key: "default_check_lead_months",
    label: "Domyślne wyprzedzenie sprawdzenia (miesiące)",
    type: "number",
  },
  {
    key: "default_expiry_lead_months",
    label: "Domyślne wyprzedzenie ważności partii (miesiące)",
    type: "number",
  },
  { key: "default_stock_count_interval_days", label: "Domyślny cykl spisu (dni)", type: "number" },
  {
    key: "out_of_range_action",
    label: "Domyślna reakcja na przekroczenie",
    type: "options",
    options: choice(["FLAG", "Oznacz wynik"], ["BLOCK", "Zablokuj zapis"]),
  },
  {
    key: "withdraw_on_calibration_nok",
    label: "Wycofaj urządzenie po wzorcowaniu NOK",
    type: "boolean",
  },
  {
    key: "ocr_enabled",
    label: "Włącz odczyt świadectw (OCR)",
    type: "boolean",
    hint: "Wymaga skonfigurowanego dostawcy na serwerze.",
  },
  { key: "session_ttl_hours", label: "Ważność sesji (godziny)", type: "number" },
  { key: "max_upload_mb", label: "Limit przesyłanego pliku (MB)", type: "number" },
  {
    key: "worker_interval_minutes",
    label: "Częstotliwość sprawdzania terminów (minuty)",
    type: "number",
  },
  { key: "login_max_attempts", label: "Maksymalna liczba prób logowania", type: "number" },
  { key: "login_window_minutes", label: "Okno limitu prób logowania (minuty)", type: "number" },
];

const notificationLabels: Record<string, string> = {
  CALIBRATION_DUE: "Termin wzorcowania",
  CHECK_DUE: "Termin sprawdzenia",
  LOT_EXPIRY: "Ważność partii",
  LOW_STOCK: "Niski stan",
  STOCK_COUNT_DUE: "Termin spisu",
  CHECK_OUT_OF_RANGE: "Sprawdzenie poza zakresem",
  RESULT_OUT_OF_RANGE: "Wynik poza zakresem",
  REPORT_READY: "Gotowy raport",
};

export function Administration(props: WorkspaceProps) {
  const { permissions } = props;
  const canEditEquipment = permissions.includes("equipment:write");
  const canEditSettings = permissions.includes("settings:write");
  const canEditUsers = permissions.includes("users:write");
  const firstTab = canEditEquipment ? "catalog" : canEditSettings ? "templates" : "users";
  return (
    <Tabs defaultValue={firstTab} className="min-w-0 gap-4">
      <TabsList
        aria-label="Sekcje administracji"
        variant="line"
        className="workspace-admin-tabs w-full flex-wrap justify-start gap-0 px-0 py-0 [&>button]:flex-none [&>button]:rounded-none [&>button]:after:bottom-[-1px]"
      >
        {canEditEquipment && <TabsTrigger value="catalog">Katalog modeli</TabsTrigger>}
        {canEditSettings && (
          <>
            <TabsTrigger value="templates">Szablony sprawdzeń</TabsTrigger>
            <TabsTrigger value="settings">Ustawienia ogólne</TabsTrigger>
            <TabsTrigger value="rules">Reguły powiadomień</TabsTrigger>
          </>
        )}
        {canEditUsers && (
          <>
            <TabsTrigger value="users">Użytkownicy</TabsTrigger>
            <TabsTrigger value="labs">Pracownie</TabsTrigger>
          </>
        )}
      </TabsList>
      {canEditEquipment && (
        <TabsContent value="catalog">
          <Catalog {...props} />
        </TabsContent>
      )}
      {canEditSettings && (
        <>
          <TabsContent value="templates">
            <Templates {...props} />
          </TabsContent>
          <TabsContent value="settings">
            <Settings {...props} />
          </TabsContent>
          <TabsContent value="rules">
            <Rules {...props} />
          </TabsContent>
        </>
      )}
      {canEditUsers && (
        <>
          <TabsContent value="users">
            <Users {...props} />
          </TabsContent>
          <TabsContent value="labs">
            <Labs {...props} />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}

function Catalog({ token }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const state = useApi<ApiRecord[]>("/equipment-catalog?include_inactive=true", token, revision);
  const after = () => setRevision((value) => value + 1);
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
        <div>
          <CardTitle>Katalog modeli</CardTitle>
          <CardDescription>
            Wspólne dane modelu do wykorzystania przy dodawaniu egzemplarza.
          </CardDescription>
        </div>
        <Action
          label="Dodaj model"
          fields={catalogFields}
          save={apiSave("/equipment-catalog", token, "POST")}
          after={after}
          primary
        />
      </CardHeader>
      <CardContent>
        {state?.data ? (
          <Rows
            rows={state.data}
            columns={catalogColumns}
            renderAction={(row) => (
              <Action
                label="Edytuj"
                fields={catalogFields}
                initial={row}
                save={apiSave(`/equipment-catalog/${Number(row.id)}`, token, "PATCH")}
                after={after}
              />
            )}
          />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

const templateFields: Field[] = [
  { key: "name", label: "Nazwa szablonu", required: true },
  {
    key: "fields",
    label: "Pola formularza (JSON)",
    type: "json",
    required: true,
    hint: "Typy: number, text, bool, date. Dla pomiarów możesz dodać jednostkę (unit) oraz granice (min, max).",
  },
];

const templateInitial = {
  fields: [
    { key: "temperatura", label: "Temperatura", type: "number", unit: "°C", required: true },
  ],
};

function Templates({ token }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const state = useApi<ApiRecord[]>("/form-templates", token, revision);
  const after = () => setRevision((value) => value + 1);
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
        <div>
          <CardTitle>Szablony sprawdzeń</CardTitle>
          <CardDescription>
            Pola, które pracownik zobaczy przy danym sprawdzeniu okresowym.
          </CardDescription>
        </div>
        <Action
          label="Dodaj szablon"
          fields={templateFields}
          initial={templateInitial}
          save={apiSave("/form-templates", token, "POST")}
          after={after}
          primary
        />
      </CardHeader>
      <CardContent>
        {state?.data ? (
          <Rows
            rows={state.data}
            columns={templateColumns}
            renderAction={(row) => (
              <Action
                label="Edytuj"
                fields={templateFields}
                initial={row}
                save={apiSave(`/form-templates/${Number(row.id)}`, token, "PATCH")}
                after={after}
              />
            )}
          />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

function Settings({ token }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const state = useApi<ApiRecord>("/settings", token, revision);
  const settingsRows = useMemo(
    () =>
      settingFields.map((field) => ({
        key: field.key,
        label: field.label,
        value: state?.data?.[field.key],
      })),
    [state],
  );
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
        <div>
          <CardTitle>Ustawienia ogólne</CardTitle>
          <CardDescription>
            Reguły terminów, sesje, limity i przetwarzanie dokumentów.
          </CardDescription>
        </div>
        {state?.data && (
          <Action
            label="Edytuj ustawienia"
            fields={settingFields}
            initial={state.data}
            save={apiSave("/settings", token, "PUT")}
            after={() => setRevision((value) => value + 1)}
          />
        )}
      </CardHeader>
      <CardContent>
        {state?.data ? (
          <Rows rows={settingsRows} columns={settingColumns} />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

const notificationRuleFields: Field[] = [
  {
    key: "recipient_roles",
    label: "Odbiorcy",
    type: "many",
    options: Object.entries(roleName).map(([value, label]) => ({ value, label })),
  },
  {
    key: "channels",
    label: "Kanały",
    type: "many",
    options: choice(["IN_APP", "W aplikacji"], ["PUSH", "Push na telefon"]),
  },
  { key: "lab_scoped", label: "Tylko osoby z danej pracowni", type: "boolean" },
  { key: "enabled", label: "Włączona", type: "boolean" },
];

function Rules({ token }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const state = useApi<ApiRecord[]>("/notification-rules", token, revision);
  const ruleRows = useMemo(
    () => state?.data?.map((row) => Object.assign({}, row, { key: row.kind })) ?? [],
    [state],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reguły powiadomień</CardTitle>
        <CardDescription>Odbiorcy i kanały dla każdego rodzaju powiadomienia.</CardDescription>
      </CardHeader>
      <CardContent>
        {state?.data ? (
          <Rows
            rows={ruleRows}
            columns={ruleColumns}
            renderAction={(row) => (
              <Action
                label="Edytuj regułę"
                fields={notificationRuleFields}
                initial={row}
                save={(data) => api("/notification-rules", token, "PUT", [{ ...row, ...data }])}
                after={() => setRevision((value) => value + 1)}
              />
            )}
          />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

function Labs({ token }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const state = useApi<ApiRecord[]>("/labs", token, revision);
  const after = () => setRevision((value) => value + 1);
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
        <CardTitle>Pracownie</CardTitle>
        <Action
          label="Dodaj pracownię"
          primary
          fields={labFields}
          save={apiSave("/labs", token, "POST")}
          after={after}
        />
      </CardHeader>
      <CardContent>
        {state?.data ? (
          <Rows
            rows={state.data}
            columns={labColumns}
            renderAction={(row) => (
              <Action
                label="Edytuj"
                fields={labFields}
                initial={row}
                save={apiSave(`/labs/${Number(row.id)}`, token, "PATCH")}
                after={after}
              />
            )}
          />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

function Users({ token }: WorkspaceProps) {
  const [revision, setRevision] = useState(0);
  const state = useApi<ApiRecord[]>("/users", token, revision);
  const roles = useApi<ApiRecord[]>("/roles", token);
  const labs = useApi<ApiRecord[]>("/labs", token);
  const after = () => setRevision((value) => value + 1);
  const fields = useMemo<Field[]>(
    () => [
      { key: "full_name", label: "Imię i nazwisko", required: true },
      {
        key: "role_id",
        label: "Rola",
        type: "options",
        options: (roles?.data ?? []).map((row) => ({
          value: textValue(row.id),
          label: roleLabel(textValue(row.name)),
        })),
        required: true,
        numeric: true,
      },
      { key: "all_labs", label: "Wszystkie pracownie", type: "boolean" },
      {
        key: "lab_ids",
        label: "Wybrane pracownie",
        type: "many",
        numeric: true,
        options: options(labs?.data ?? []),
      },
      { key: "active", label: "Konto aktywne", type: "boolean" },
    ],
    [roles, labs],
  );
  const createUserFields = useMemo<Field[]>(
    () => [
      { key: "login", label: "Login", required: true },
      { key: "password", label: "Hasło", type: "password", required: true },
      ...fields,
    ],
    [fields],
  );
  const editUserFields = useMemo<Field[]>(
    () => [...fields, { key: "password", label: "Nowe hasło (opcjonalnie)", type: "password" }],
    [fields],
  );
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:items-center sm:justify-between">
        <CardTitle>Użytkownicy i role</CardTitle>
        <Action
          label="Dodaj użytkownika"
          primary
          fields={createUserFields}
          save={apiSave("/users", token, "POST")}
          after={after}
        />
      </CardHeader>
      <CardContent>
        {state?.data ? (
          <Rows
            rows={state.data}
            columns={userColumns}
            renderAction={(row) => (
              <Action
                label="Edytuj"
                fields={editUserFields}
                initial={row}
                save={apiSave(`/users/${Number(row.id)}`, token, "PATCH")}
                after={after}
              />
            )}
          />
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

export function Audit({ token }: WorkspaceProps) {
  const [offset, setOffset] = useState(0);
  const state = useApi<ApiRecord[]>("/audit", token);
  const page = useMemo(
    () => state?.data?.slice(offset, offset + 50).map(auditRow) ?? [],
    [state, offset],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dziennik operacji</CardTitle>
        <CardDescription>Zapis operacji wykonanych w laboratorium.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {state?.data ? (
          <>
            <Rows rows={page} columns={auditColumns} />
            {state.data.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Wpisy {offset + 1}–{Math.min(offset + 50, state.data.length)} z{" "}
                  {state.data.length}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset((value) => value - 50)}
                  >
                    Nowsze
                  </Button>
                  <Button
                    variant="outline"
                    disabled={state.data.length <= offset + 50}
                    onClick={() => setOffset((value) => value + 50)}
                  >
                    Starsze
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <Loading state={state} />
        )}
      </CardContent>
    </Card>
  );
}

const catalogColumns: Columns = [
  ["name", "Nazwa"],
  ["manufacturer", "Producent"],
  ["model", "Model"],
  ["category", "Kategoria"],
  ["active", "Aktywny", (value) => (value ? "Tak" : "Nie")],
];

const templateColumns: Columns = [
  ["name", "Nazwa"],
  ["fields", "Liczba pól", (value) => (Array.isArray(value) ? value.length : "—")],
];

const settingColumns: Columns = [
  ["label", "Ustawienie"],
  [
    "value",
    "Wartość",
    (value) =>
      typeof value === "boolean"
        ? value
          ? "Tak"
          : "Nie"
        : Array.isArray(value)
          ? value.join(" – ")
          : textValue(value),
  ],
];

const ruleColumns: Columns = [
  ["kind", "Zdarzenie", (value) => notificationLabels[textValue(value)] ?? textValue(value)],
  [
    "recipient_roles",
    "Odbiorcy",
    (value) =>
      Array.isArray(value) ? value.map((role) => roleLabel(String(role))).join(", ") : "—",
  ],
  ["enabled", "Włączona", (value) => (value ? "Tak" : "Nie")],
];

const labColumns: Columns = [
  ["code", "Kod"],
  ["name", "Nazwa"],
  ["active", "Aktywna", (value) => (value ? "Tak" : "Nie")],
];

const userColumns: Columns = [
  ["login", "Login"],
  ["full_name", "Użytkownik"],
  ["role", "Rola", (value) => roleLabel(textValue(value))],
  ["active", "Aktywny", (value) => (value ? "Tak" : "Nie")],
];

function auditRow(row: ApiRecord): ApiRecord {
  const entry = describeAudit({
    action: textValue(row.action),
    entity: textValue(row.entity),
    entity_id: typeof row.entity_id === "string" ? row.entity_id : null,
    before: row.before,
    after: row.after,
  });
  return { ...row, operation: entry.title, subject: entry.subject };
}

const auditColumns: Columns = [
  ["at", "Czas", (value) => textValue(value).replace("T", " ").slice(0, 19)],
  ["operation", "Operacja"],
  ["subject", "Obiekt"],
  ["entity_id", "Identyfikator"],
  ["user_id", "Użytkownik"],
  ["reason", "Powód"],
];
