/** Polish wording for audit log rows. The log itself comes from the API unchanged. */

export type AuditEntry = {
  action: string;
  entity: string;
  entity_id: string | null;
  before?: unknown;
  after?: unknown;
};

const ACTIONS: Record<string, string> = {
  create: "Dodano",
  update: "Zmieniono",
  delete: "Usunięto",
  reject: "Odrzucono",
  append: "Dopisano",
};

/** Accusative forms, so every action above reads as a sentence: "Dodano partię odczynnika". */
const ENTITIES: Record<string, string> = {
  app_user: "konto użytkownika",
  attachment: "załącznik",
  calibration: "wzorcowanie",
  calibration_plan: "plan wzorcowania",
  calibration_point: "punkt wzorcowania",
  check_plan: "plan sprawdzenia",
  check_record: "sprawdzenie",
  device_token: "telefon do powiadomień",
  equipment: "urządzenie",
  equipment_authorization: "upoważnienie",
  equipment_catalog: "model w katalogu",
  form_template: "szablon formularza",
  lab: "pracownię",
  notification: "powiadomienie",
  notification_rule: "regułę powiadomień",
  reagent: "odczynnik",
  reagent_lot: "partię odczynnika",
  report: "raport",
  role: "rolę",
  setting: "ustawienie",
  stock_count: "spis stanu",
  test_parameter: "parametr badania",
  test_result: "wynik badania",
  user_session: "sesję",
};

const NAME_KEYS = ["name", "sample_label", "certificate_no", "lot_no", "login", "label", "title"];

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}

export function describeAudit(entry: AuditEntry): { title: string; subject: string } {
  const after = record(entry.after);
  const state = Object.keys(after).length > 0 ? after : record(entry.before);
  const name = NAME_KEYS.map((key) => text(state, key)).find((value) => value !== null);
  const code = text(state, "code");
  const subject =
    [code, name].filter((part) => part != null).join(" ") || `#${entry.entity_id ?? "—"}`;
  if (entry.action === "login") {
    return { title: after.success === false ? "Nieudane logowanie" : "Zalogowano", subject };
  }
  if (entry.action === "ocr_extract") {
    return { title: "Odczytano świadectwo przez OCR", subject };
  }
  const action = ACTIONS[entry.action];
  const entity = ENTITIES[entry.entity];
  return {
    title: action && entity ? `${action} ${entity}` : `${entry.action} ${entry.entity}`,
    subject,
  };
}
