/** Demo persistence. Reloads keep the presenter's entries; "Reset danych" restores the seed. */

import { createDb } from "./seed";
import type { MockDb } from "./types";

const STORAGE_KEY = "lab.demo.v2";

function isMockDb(value: unknown): value is MockDb {
  return (
    typeof value === "object" &&
    value !== null &&
    "today" in value &&
    "users" in value &&
    "roles" in value &&
    Array.isArray(value.roles)
  );
}

function loadSavedDb(): MockDb | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isMockDb(parsed) ? parsed : null;
  } catch {
    // Corrupted or unavailable storage should not stop the demo; fall back to the seed.
    return null;
  }
}

export const db: MockDb = loadSavedDb() ?? createDb();

export function persistDb(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Private mode or full quota: keep the in-memory demo running.
  }
}

export function resetDb(): void {
  const previousRole = db.users.find((user) => user.id === db.activeUserId)?.roleCode ?? null;
  Object.assign(db, createDb());
  if (previousRole !== null) {
    const user = db.users.find((candidate) => candidate.roleCode === previousRole);
    if (user) {
      db.activeUserId = user.id;
    }
  }
  persistDb();
}
