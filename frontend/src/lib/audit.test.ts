import { describe, expect, test } from "bun:test";

import { describeAudit } from "./audit";

describe("describeAudit", () => {
  test("names the record by code and name", () => {
    expect(
      describeAudit({
        action: "create",
        entity: "equipment",
        entity_id: "1",
        after: { code: "121/A", name: "Waga analityczna" },
      }),
    ).toEqual({ title: "Dodano urządzenie", subject: "121/A Waga analityczna" });
  });

  test("reads the subject of a deleted record from its previous state", () => {
    expect(
      describeAudit({
        action: "delete",
        entity: "reagent_lot",
        entity_id: "3",
        before: { lot_no: "CRM-2401-A" },
        after: null,
      }),
    ).toEqual({ title: "Usunięto partię odczynnika", subject: "CRM-2401-A" });
  });

  test("tells a failed login apart from a successful one", () => {
    expect(
      describeAudit({
        action: "login",
        entity: "app_user",
        entity_id: "1",
        after: { success: false, login: "admin" },
      }),
    ).toEqual({ title: "Nieudane logowanie", subject: "admin" });
  });

  test("falls back to the raw codes and the record id", () => {
    expect(
      describeAudit({ action: "archive", entity: "sample", entity_id: "7", after: {} }),
    ).toEqual({ title: "archive sample", subject: "#7" });
  });
});
