import type { AuthorityPolicy, Delegation } from "./types";
import type { IndependentExpenseSnapshot } from "./independentTypes";

export type OperationsSection = "approvals" | "finance" | "administration";
export interface OperationsExpense {
  source?: "INDEPENDENT";
  id: string | number; doc_no: string; status: string; amount: string | number; expense_date: string;
  division_id: number | null; department_id: number | null; coa_id: number | null;
  remarks: string | null; receipt_url: string | null;
  created_by: { user_id: number; user_fname?: string; user_lname?: string; company_id: number | null } | null;
  departmentName?: string; divisionName?: string; coaName?: string;
  categoryName?: string; requiredAuthority?: string | null;
  assignedApproverId?: number | null;
  independentSnapshot?: IndependentExpenseSnapshot;
  revision?: number;
  dummyActions?: { finance: boolean; decide: boolean; blocker: string };
}
export interface OperationsData {
  actor: { id: number; name: string; companyId: number | null; authorities: string[] };
  capabilities: { finance: boolean; audit: boolean; settings: boolean; editPolicies: boolean; manageOfficers: boolean };
  grantStoreAvailable: boolean; blockers: string[]; policies: AuthorityPolicy[]; assignments: Delegation[];
  moduleExpenses: OperationsExpense[]; expensePage: number; expenseHasMore: boolean;
  assignedExpenses?: OperationsExpense[];
  decidedExpenses?: OperationsExpense[];
  decisionHistoryAvailable?: boolean;
  employeeRequests?: OperationsExpense[];
  dummyEnabled?: boolean;
  revision: number;
  audit: { id: string; created_at: string; actor_name: string; event: unknown; revision: number }[];
  hasMore: boolean;
}
export interface OperationsLog {
  id: string | number; action: string; remarks: string | null; created_at: string;
  created_by: { user_fname?: string; user_lname?: string } | null;
}
