/** Mock-backend authorization. The production equivalent is FastAPI's service layer. */

import type { Permission } from "@/api/types";

import type { MockDb, RoleRecord, UserRecord } from "./types";

export function userRole(db: MockDb, user: UserRecord): RoleRecord | null {
  return db.roles.find((candidate) => candidate.code === user.roleCode) ?? null;
}

export function userPermissions(db: MockDb, user: UserRecord): Permission[] {
  return userRole(db, user)?.permissions ?? [];
}

export function userHasPermission(db: MockDb, user: UserRecord, permission: Permission): boolean {
  return userPermissions(db, user).includes(permission);
}

export function userLabIds(db: MockDb, user: UserRecord): string[] {
  return user.labIds === "ALL" ? db.labs.map((lab) => lab.id) : user.labIds;
}

export function activeUser(db: MockDb): UserRecord {
  const user = db.users.find((candidate) => candidate.id === db.activeUserId);
  if (!user) {
    throw new Error(`No active user: ${db.activeUserId}`);
  }
  return user;
}

/**
 * Report recipients are the readers: `report:read` without the office's `report:write` (docs 02
 * §5).
 */
export function canReceiveReports(permissions: Permission[]): boolean {
  return permissions.includes("report:read") && !permissions.includes("report:write");
}
