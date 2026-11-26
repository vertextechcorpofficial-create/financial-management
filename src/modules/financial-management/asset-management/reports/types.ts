export type ReportTabKey =
  | "register"
  | "rollforward"
  | "pl"
  | "deptdep"
  | "forecast"
  | "maint"
  | "activity";

export interface AssetRegisterRow {
  id: number;
  assetTag: string;
  rfid: string;
  assetName: string;
  itemType: string;
  classification: string;
  department: string;
  assignedTo: string;
  condition: string;
  acquired: string;
  cost: number;
  accumDep: number;
  accumImp: number;
  projectedValue: number;
  status: string;
  isInUse: boolean;
}

export interface AssetRegisterReport {
  asOf: string;
  rows: AssetRegisterRow[];
  totals: {
    cost: number;
    accumDep: number;
    accumImp: number;
    projectedValue: number;
  };
}

export interface PpeMovementRow {
  type: "section" | "row" | "subtotal" | "grand";
  particulars: string;
  values: Record<string, number>;
  total: number;
}

export interface PpeMovementReport {
  year: string;
  classifications: string[];
  rows: PpeMovementRow[];
}

export interface FsImpactRow {
  type: "section" | "row" | "muted" | "total";
  account: string;
  amount: number | null;
}

export interface FsImpactReport {
  year: string;
  rows: FsImpactRow[];
}

export interface DeptDepRow {
  department: string;
  months: number[]; // 12 entries: Jan (0) .. Dec (11)
  total: number;
}

export interface DeptDepReport {
  year: string;
  rows: DeptDepRow[];
  totals: number[]; // 12 entries
  grandTotal: number;
}

export interface ForecastRow {
  classification: string;
  years: Record<string, number>;
}

export interface ForecastReport {
  years: string[];
  asOf: string;
  rows: ForecastRow[];
  totals: Record<string, number>;
}

export interface MaintenanceLogRow {
  id: number;
  date: string;
  assetId: number;
  assetTag: string;
  assetName: string;
  department: string;
  type: string;
  description: string;
  vendor: string;
  downtimeDays: number | null;
  cost: number | null;
  treatment: string;
  nextDue: string;
}

export interface MaintenanceLogReport {
  rows: MaintenanceLogRow[];
  expensedTotal: number;
  capitalisedTotal: number;
  totalCost: number;
}

export interface ActivityLogChange {
  field: string;
  from: string;
  to: string;
}

export interface ActivityLogRow {
  id: number;
  when: string;
  whenFormatted: string;
  userName: string;
  roleName: string;
  actionCode: string;
  actionName: string;
  assetId: number | null;
  assetTag: string | null;
  details: string;
  changes: ActivityLogChange[];
}

export interface ActivityLogReport {
  rows: ActivityLogRow[];
  users: string[];
  actions: { code: string; name: string }[];
}

export interface AssetReportsPayload {
  year: string;
  asOf: string;
  availableYears: string[];
  assetRegister: AssetRegisterReport;
  ppeMovement: PpeMovementReport;
  fsImpact: FsImpactReport;
  depreciationByDept: DeptDepReport;
  depreciationForecast: ForecastReport;
  maintenanceLog: MaintenanceLogReport;
  activityLog: ActivityLogReport;
}
