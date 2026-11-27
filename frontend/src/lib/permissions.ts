/** Capability check only: the permission list is issued by the API, not derived here. */

import type { Permission, Session } from "@/api/types";

export function can(session: Session, permission: Permission): boolean {
  return session.permissions.includes(permission);
}
