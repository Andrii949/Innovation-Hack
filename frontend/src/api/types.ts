/**
 * Provisional API contract.
 *
 * The backend has no OpenAPI document yet (`bun run gen:api` will replace this file with generated
 * types). Shapes here follow docs/02-architektura.md §3 and §7. Everything the UI needs to _decide_
 * — permissions, lab scope, equipment `canWrite*`, statuses, due dates, range verdicts — arrives
 * from the API. The UI must never recompute or hardcode those.
 */

export type IsoDate = string; // YYYY-MM-DD
export type IsoMonth = string; // YYYY-MM
export type IsoDateTime = string;
export type DecimalString = string; // "0.10" — JSON never carries measurement floats

/** Status codes from docs/02 §4.2. The API computes them from data. */
export type Status =
  "OK" | "DUE_SOON" | "OVERDUE" | "NO_DATA" | "WITHDRAWN" | "NOT_REQUIRED" | "LOW" | "COUNT_DUE";

export const DUE_KINDS = [
  "CALIBRATION",
  "CHECK",
  "LOT_EXPIRY",
  "LOW_STOCK",
  "STOCK_COUNT",
] as const;

export type DueKind = (typeof DUE_KINDS)[number];

export type DueRefType = "EQUIPMENT" | "CHECK_PLAN" | "REAGENT_LOT" | "REAGENT";

/** One row of the unified schedule (docs/02 §4.4). */
export type DueItem = {
  id: string;
  kind: DueKind;
  refType: DueRefType;
  refId: string;
  labId: string;
  labName: string;
  label: string;
  equipmentId: string | null;
  due: IsoDate;
  alertFrom: IsoDate;
  validUntil: IsoDate;
  status: Status;
};

/** Capabilities granted to a session. Names are the contract; the server owns the values. */
export type Permission =
  | "equipment:read"
  | "equipment:write"
  | "calibration:write"
  | "check:write"
  | "schedule:read"
  | "reagent:read"
  | "reagent:write"
  | "stock:write"
  | "result:read"
  | "result:write"
  | "settings:write"
  | "users:write"
  | "audit:read"
  | "report:read"
  | "report:generate"
  | "report:send"
  | "report:acknowledge";

export type Role = {
  code: string;
  name: string;
};

/** Resolved by the server: what this user may see and do. */
export type Session = {
  user: {
    id: string;
    login: string;
    fullName: string;
  };
  role: Role;
  permissions: string[];
  labIds: string[];
  allLabs: boolean;
  authorizedEquipmentIds: string[];
};

export type Lab = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type EquipmentCategory =
  | "BALANCE"
  | "THERMOMETER"
  | "OVEN"
  | "MASS_STANDARD"
  | "APPARATUS"
  | "PRESS"
  | "CALORIMETER"
  | "SPECTROMETER";

export type CalibrationMode = "EXTERNAL" | "ON_SITE";

export type CalibrationPoint = {
  point: string;
  error: DecimalString;
  uncertainty: DecimalString;
  unit: string;
};

export type CalibrationResult = "OK" | "NOK";

export type Calibration = {
  id: string;
  equipmentId: string;
  calibratedMonth: IsoMonth;
  vendor: string;
  certificateNo: string;
  adjustments: string;
  result: CalibrationResult;
  /** Copied at creation for the record; deadlines themselves are derived. */
  nextDueMonth: IsoMonth | null;
  note: string;
  points: CalibrationPoint[];
};

export type Equipment = {
  id: string;
  publicId: string;
  labId: string;
  number: string;
  name: string;
  category: EquipmentCategory;
  manufacturer: string;
  model: string;
  serialNo: string;
  softwareVersion: string | null;
  location: string;
  calibrationRequired: boolean;
  calibrationIntervalMonths: number | null;
  calibrationMode: CalibrationMode;
  leadMonths: number;
  acceptanceCriteria: string;
  withdrawnAt: IsoDate | null;
  withdrawnReason: string | null;
  notes: string;
};

/** `Equipment` as returned by the API for the current session. */
export type EquipmentView = Equipment & {
  labName: string;
  displayCode: string;
  status: Status;
  calibrations: Calibration[];
  lastCalibration: Calibration | null;
  nextDue: DueItem | null;
  authorizedUsers: { id: string; fullName: string }[];
  canWriteCalibration: boolean;
  canWriteCheck: boolean;
};

export type FieldType = "number" | "text" | "bool" | "date";

export type FormField = {
  key: string;
  label: string;
  type: FieldType;
  unit: string | null;
  min: DecimalString | null;
  max: DecimalString | null;
  required: boolean;
};

export type FormTemplate = {
  id: string;
  name: string;
  fields: FormField[];
};

export type CheckPlan = {
  id: string;
  equipmentId: string;
  name: string;
  intervalMonths: number;
  leadMonths: number;
  formTemplateId: string;
  active: boolean;
};

export type CheckRecord = {
  id: string;
  checkPlanId: string;
  performedOn: IsoDate;
  values: Record<string, string>;
  outOfRange: boolean;
  performedBy: string;
  note: string;
};

export type CheckPlanView = CheckPlan & {
  equipmentName: string;
  template: FormTemplate;
  lastRecord: CheckRecord | null;
  nextDue: DueItem | null;
  canWrite: boolean;
};

export type ReagentKind = "REAGENT" | "CRM";

export type Reagent = {
  id: string;
  labId: string;
  name: string;
  kind: ReagentKind;
  unit: string;
  minStock: DecimalString;
  stockCountIntervalDays: number;
  expiryLeadMonths: number;
  active: boolean;
};

export type ReagentLot = {
  id: string;
  reagentId: string;
  lotNo: string;
  expiryDate: IsoDate;
  quantity: DecimalString;
  receivedOn: IsoDate;
  disposedOn: IsoDate | null;
};

export type StockCount = {
  id: string;
  reagentId: string;
  quantity: DecimalString;
  countedOn: IsoDate;
  countedBy: string;
};

/** `Reagent` with server-derived stock, expiry and status. */
export type ReagentView = Reagent & {
  labName: string;
  stock: DecimalString;
  lastCount: StockCount | null;
  lastMovementOn: IsoDate | null;
  nearestLot: ReagentLot | null;
  expiryStatus: Status | null;
  status: Status;
  canWriteStock: boolean;
};

export type OutOfRangeAction = "FLAG" | "BLOCK";

export type TestParameter = {
  id: string;
  material: string;
  name: string;
  unit: string;
  minValue: DecimalString | null;
  maxValue: DecimalString | null;
  method: string;
  accredited: boolean;
  outOfRangeAction: OutOfRangeAction;
  active: boolean;
};

export type TestResult = {
  id: string;
  parameterId: string;
  sampleLabel: string;
  value: DecimalString;
  minSnapshot: DecimalString | null;
  maxSnapshot: DecimalString | null;
  inRange: boolean;
  repeatOfId: string | null;
  createdBy: string;
  sampledAt: IsoDate;
};

export type TestResultView = TestResult & {
  parameterName: string;
  unit: string;
  repeat: TestResult | null;
};

export type Notification = {
  id: string;
  userId: string;
  kind:
    | "CALIBRATION_DUE"
    | "CHECK_DUE"
    | "LOT_EXPIRY"
    | "LOW_STOCK"
    | "STOCK_COUNT_DUE"
    | "CHECK_OUT_OF_RANGE"
    | "RESULT_OUT_OF_RANGE"
    | "REPORT_SENT";
  refType: string;
  refId: string;
  title: string;
  body: string;
  due: IsoDate | null;
  dedupeKey: string;
  readAt: IsoDateTime | null;
  resolvedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type ReportStatus = "SENT" | "ACKNOWLEDGED";

export type ReportSummary = {
  equipment: number;
  overdue: number;
  dueSoon: number;
  lowStock: number;
  checksInPeriod: number;
  checksOutOfRange: number;
  resultsInPeriod: number;
  resultsOutOfRange: number;
  repeatPending: number;
};

export type Report = {
  id: string;
  title: string;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  labIds: string[];
  createdBy: string;
  createdAt: IsoDateTime;
  sentAt: IsoDateTime;
  acknowledgedAt: IsoDateTime | null;
  acknowledgedByUserId: string | null;
  summary: ReportSummary;
  notes: string;
};

export type ReportView = Report & {
  createdByName: string;
  acknowledgedByName: string | null;
  status: ReportStatus;
};

export type AuditAction = "create" | "update" | "delete" | "reject" | "login";

export type AuditLog = {
  id: string;
  at: IsoDateTime;
  userId: string;
  userName: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  before: string | null;
  after: string | null;
  reason: string | null;
};

export type ErrorCode =
  | "NOT_AUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "TOO_MANY_ATTEMPTS"
  | "FORBIDDEN"
  | "LAB_OUT_OF_SCOPE"
  | "NOT_AUTHORIZED_FOR_EQUIPMENT"
  | "NOT_FOUND"
  | "EQUIPMENT_WITHDRAWN"
  | "DUPLICATE_EQUIPMENT_NUMBER"
  | "DUPLICATE_LAB_CODE"
  | "USER_NOT_IN_LAB"
  | "INVALID_NUMBER"
  | "INVALID_DATE"
  | "OUT_OF_RANGE"
  | "RENDER_FAILED"
  // Provisional until the backend publishes OpenAPI.
  | "REQUIRED_FIELD";

export type ApiError = {
  error: ErrorCode;
  message: string;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Demo-only snapshot: several API reads composed by the mock client. */
export type Snapshot = {
  today: IsoDate;
  session: Session;
  demoRoles: Role[];
  labs: Lab[];
  schedule: DueItem[];
  equipment: EquipmentView[];
  plans: CheckPlanView[];
  templates: FormTemplate[];
  results: TestResultView[];
  parameters: TestParameter[];
  reagents: ReagentView[];
  reports: ReportView[];
  notifications: Notification[];
  audit: AuditLog[];
};
