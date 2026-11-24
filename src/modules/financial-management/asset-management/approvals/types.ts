export interface ApprovalEventItem {
  id: number;
  asset_id: number;
  asset_tag: string;
  item_name: string;
  department_name: string;
  entry_source: string; // e.g. "Manual entry", "Maintenance log", "Clearance"
  event_type: string; // e.g. "Impairment test / reversal", "Disposal", "Revaluation"
  event_date: string;
  notes: string;
  impact_amount: number;
  requested_by_name: string;
  requested_at: string;
  maker_id: number;
  status: "draft" | "approved" | "rejected";
  decision_by_name?: string | null;
  decision_at?: string | null;
  rejection_reason?: string | null;
}

export interface ApprovalsKPIs {
  waitingCount: number;
  valueWaiting: number;
  approvalThreshold: number;
  appliesToText: string;
}

export interface ApprovalsData {
  kpis: ApprovalsKPIs;
  waitingApprovals: ApprovalEventItem[];
  recentlyDecided: ApprovalEventItem[];
}
