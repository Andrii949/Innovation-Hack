/** Mock-backend storage. Roles and permissions are rows here, as in the real database. */

import type {
  AuditLog,
  Calibration,
  CheckPlan,
  CheckRecord,
  Equipment,
  FormTemplate,
  IsoDate,
  Lab,
  Notification,
  Permission,
  Reagent,
  ReagentLot,
  Report,
  Role,
  StockCount,
  TestParameter,
  TestResult,
} from "@/api/types";

export type RoleRecord = Role & {
  permissions: Permission[];
};

export type UserRecord = {
  id: string;
  login: string;
  fullName: string;
  roleCode: string;
  labIds: string[] | "ALL";
  authorizedEquipmentIds: string[];
  active: boolean;
};

export type MockDb = {
  today: IsoDate;
  labs: Lab[];
  roles: RoleRecord[];
  users: UserRecord[];
  equipment: Equipment[];
  calibrations: Calibration[];
  templates: FormTemplate[];
  plans: CheckPlan[];
  checkRecords: CheckRecord[];
  reagents: Reagent[];
  lots: ReagentLot[];
  stockCounts: StockCount[];
  parameters: TestParameter[];
  results: TestResult[];
  notifications: Notification[];
  reports: Report[];
  audit: AuditLog[];
  activeUserId: string;
};
