export type EmployeeClearanceStatus = "Active" | "In clearance" | "Cleared";

export interface ClearanceAssetItem {
  id: number;
  asset_tag: string;
  item_name: string;
  classification_name: string;
  rfid_code: string;
  serial: string | null;
  carrying_amount: number;
  condition: string;
  action_taken?: "RETURNED_TO_STOCK" | "REASSIGNED" | "LOST" | null;
  reassigned_to_user_id?: number | null;
  reassigned_to_dept_id?: number | null;
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
  clearance_request_id?: number | null;
  assets: ClearanceAssetItem[];
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
}
