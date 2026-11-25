export type EmployeeClearanceStatus = "Active" | "In clearance" | "Cleared";

export type ClearanceActionCode = "RETURNED_TO_STOCK" | "REASSIGNED" | "LOST";

export interface ClearanceAssetItem {
  id: number;
  asset_tag: string;
  item_name: string;
  classification_name: string;
  rfid_code: string;
  serial: string | null;
  carrying_amount: number;
  condition: string;
  condition_id?: number | null;
  department_id?: number | null;
  location?: string | null;
  action_taken?: ClearanceActionCode | null;
  reassigned_to_user_id?: number | null;
  reassigned_to_dept_id?: number | null;
}

export interface ProcessedClearanceLine {
  id: number;
  clearance_request_id: number;
  asset_id: number;
  asset_tag: string;
  item_name: string;
  condition_id: number | null;
  condition_name: string;
  action_id: number | null;
  action_code: ClearanceActionCode | null;
  action_label: string;
  to_department_id: number | null;
  to_department_name: string;
  to_user_id: number | null;
  to_user_name: string;
  to_location: string | null;
  amount_charged: number | null;
  transfer_id: number | null;
  event_id: number | null;
  processed_by: number | null;
  processed_at: string | null;
  remarks: string | null;
}

export interface EmployeeClearanceRecord {
  employee_id: number;
  employee_name: string;
  department_id: number | null;
  department_name: string;
  assets_held_count: number;
  total_carrying_amount: number;
  status: EmployeeClearanceStatus;
  last_day?: string | null;
  clearance_reason?: string | null;
  cleared_at?: string | null;
  clearance_request_id?: number | null;
  assets: ClearanceAssetItem[];
  processed_lines: ProcessedClearanceLine[];
}

export interface ClearanceLookupDepartment {
  department_id: number;
  department_name: string;
}

export interface ClearanceLookupCondition {
  id: number;
  condition_name: string;
}

export interface ClearanceLookupUser {
  user_id: number;
  user_name: string;
  department_id: number | null;
  department_name: string;
}

export interface EmployeeClearanceKPIs {
  totalEmployees: number;
  inClearanceCount: number;
  clearedCount: number;
  assetsWithPeople: number;
}

export interface EmployeeClearanceData {
  kpis: EmployeeClearanceKPIs;
  employees: EmployeeClearanceRecord[];
  departments: ClearanceLookupDepartment[];
  conditions: ClearanceLookupCondition[];
  activeUsers: ClearanceLookupUser[];
}
