export const reportMenu = {
  soa: { label: "Statement of account", description: "Posted activity and balances for a member over a selected period." },
  portfolio: { label: "Loan portfolio", description: "Loans by product, principal, balance and status." },
  aging: { label: "Loan aging", description: "Past-due installments by days late, with penalties." },
  collections: { label: "Collections", description: "Posted loan payments, deposits, fees and reversals." },
  savings: { label: "Savings balances", description: "Member savings, deposits and withdrawals for a selected period." },
  roster: { label: "Membership roster", description: "VOS employees, membership status and agreement details." },
  docs: { label: "Document compliance", description: "Memberships, loans and clearances with missing required documents." },
  "trial-balance": { label: "Trial balance", description: "Opening balances, activity and closing balances by GL account." },
  "month-end": { label: "Month-end reconciliation", description: "Compare cash and payroll balances to their supporting records." },
  audit: { label: "Audit Trail", description: "Review recorded actions, changes and decision reasons." },
} as const;

export type ReportKey = keyof typeof reportMenu;
export type MemberReportKey = "soa" | "savings" | "roster" | "docs";
export const reportLoanStatuses = {
  PENDING: "For approval", APPROVED: "For release", ACTIVE: "Active", PAST_DUE: "Past due",
  FULLY_PAID: "Fully paid", DEFAULTED: "Defaulted", REJECTED: "Rejected",
} as const;
export const reportRecordTypes = { membership: "Membership", loan: "Loan", clearance: "Exit clearance" } as const;
export const reportPageSize = 50;
export const cashEvidenceLabels = { CASH_ON_HAND: "Cash count", CASH_IN_BANK: "Bank statement" } as const;
export type CashEvidencePurpose = keyof typeof cashEvidenceLabels;
export type CashEvidenceContext = {
  purpose: CashEvidencePurpose;
  periodEnd: string;
  accountId: number;
  accountLabel: string;
  revision: number;
  amount: string | null;
  reference: string | null;
};

export type ReportColumn = { label: string; kind?: "money" | "date" | "number" | "changes" };
export type ReportCell = string | number | null;
export type ReportRow = {
  id: number | string;
  cells: ReportCell[];
  changes?: Array<{ field: string; before: string | null; after: string | null }>;
};
export type ReportTableData = {
  columns: ReportColumn[];
  rows: ReportRow[];
  opening?: ReportCell[];
  totals: ReportCell[];
};
export type ReportNotice = {
  label: string;
  state: "pending_rollout" | "unavailable";
  message: string;
};
export const sectionPageParams = { loans: "loanPage", activity: "activityPage", remittances: "remittancePage" } as const;
export type SectionKey = keyof typeof sectionPageParams;
export type ReportSection = ReportTableData & { key: SectionKey; label: string };
export type ReportResult = ReportTableData & {
  metadata: Array<[string, string]>;
  departments: string[];
  products?: Array<{ id: number; name: string }>;
  notices?: ReportNotice[];
  sections?: ReportSection[];
  cashEvidence?: CashEvidenceContext[];
  actors?: Array<{ id: number; name: string }>;
  actions?: Array<{ code: string; name: string }>;
  blocked?: boolean;
};
export type ReportTablePage = ReportTableData & { count: number; page: number; pageSize: number };
export type ReportPage = Omit<ReportResult, "sections"> & ReportTablePage & {
  sections?: Array<ReportSection & ReportTablePage>;
  fingerprint: string;
  generatedOn: string;
};
