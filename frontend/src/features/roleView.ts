import type { Session } from "@/api/types";
import { can } from "@/lib/permissions";

/**
 * Demo landing choice by capability, not by role name: whichever role row the backend returns, the
 * session sees the view its permissions allow. No role/permission table here.
 */
export type DemoView = "manager" | "office" | "lab";

export function viewForSession(session: Session): DemoView {
  if (can(session, "report:read") && !can(session, "report:write")) {
    return "manager";
  }
  if (can(session, "calibration:write")) {
    return "office";
  }
  return "lab";
}
