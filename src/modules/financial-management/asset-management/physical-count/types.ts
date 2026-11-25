export type CountStatus = "In progress" | "Completed" | "Cancelled";
export type CountMethod = "RFID reader" | "Manual checklist";

export interface CountSession {
  id: number;
  name: string;
  count_date: string;
  method_id: number;
  method_name: "RFID" | "Manual";
  location_filter?: string | null;
  status_id: number;
  status: CountStatus;
  started_by: number;
  counted_by_name: string;
  started_at: string;
  completed_by?: number | null;
  completed_at?: string | null;
  expected_count: number;
  found_count: number;
  missing_count: number;
  misplaced_count: number;
  derecognised_found_count: number;
  unknown_count: number;
  untagged_count: number;
  accuracy_percent: number;
  departments: string[];
  remarks?: string | null;
}

export type CountResultType =
  | "missing"
  | "found"
  | "misplaced"
  | "unknown"
  | "derecognised";

export interface CountItemResult {
  id: number | string;
  asset_id?: number | null;
  asset_tag?: string;
  item_name?: string;
  rfid_code?: string;
  barcode?: string;
  serial?: string;
  brand?: string;
  model?: string;
  department_name?: string;
  holder_name?: string;
  location?: string;
  carrying_amount: number;
  verified_by?: string;
  condition_observed: string;
  result_type: CountResultType;
  // For misplaced:
  actual_department_id?: number;
  actual_department_name?: string;
  // Resolution:
  resolution?: string; // "Transfer to department", "Confirmed lost", "Keep in location", etc.
  note?: string;
  // For unknown/untagged:
  description?: string;
}

export interface PhysicalCountOverviewData {
  totalSessions: number;
  inProgressCount: number;
  lastCompletedDate: string | null;
  notVerifiedCount: number;
  notVerifiedAssets: {
    id: number;
    asset_tag: string;
  }[];
  sessions: CountSession[];
}

export interface StartCountSessionPayload {
  name: string;
  count_date: string;
  method: "RFID reader" | "Manual checklist";
  location_filter?: string;
  department_ids: number[];
}
