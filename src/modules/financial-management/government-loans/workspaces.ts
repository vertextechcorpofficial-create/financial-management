export const GOVERNMENT_LOANS_PARENT = {
  title: "Government Loans",
  slug: "government-loans",
  path: "/fm/government-loans",
  iconName: "Landmark",
} as const;

export const GOVERNMENT_LOANS_DASHBOARD = {
  key: "dashboard",
  title: "Dashboard",
  slug: "government-loans-dashboard",
  path: "/fm/government-loans/dashboard",
  iconName: "LayoutDashboard",
  sort: 1,
  description: "Overview of government loans, payroll deductions, remittances, and pending work.",
} as const;

export const GOVERNMENT_LOANS_LOAN_APPLICATIONS = {
  key: "loan-applications",
  title: "Loan Applications",
  slug: "government-loans-loan-applications",
  path: "/fm/government-loans/loan-applications",
  iconName: "FilePlus2",
  sort: 2,
  description: "File and track SSS, Pag-IBIG, and partner-bank loan requests.",
} as const;

export const GOVERNMENT_LOANS_LOANS = {
  key: "loans",
  title: "Loans",
  slug: "government-loans-loans",
  path: "/fm/government-loans/loans",
  iconName: "HandCoins",
  sort: 3,
  description: "Monitor active loans, agency balances, payroll instructions, and loan changes.",
} as const;

export const GOVERNMENT_LOANS_REMITTANCES = {
  key: "remittances",
  title: "Remittances",
  slug: "government-loans-remittances",
  path: "/fm/government-loans/remittances",
  iconName: "Send",
  sort: 4,
  description: "Prepare, reconcile, and remit agency payments.",
} as const;

export const GOVERNMENT_LOANS_LOAN_APPROVAL = {
  key: "loan-approval",
  title: "Loan Approval",
  slug: "government-loans-loan-approval",
  path: "/fm/government-loans/loan-approval",
  iconName: "ClipboardCheck",
  sort: 5,
  description: "Review loan requests and verify enrollment evidence.",
} as const;

export const GOVERNMENT_LOANS_REMITTANCE_APPROVAL = {
  key: "remittance-approval",
  title: "Remittance Approval",
  slug: "government-loans-remittance-approval",
  path: "/fm/government-loans/remittance-approval",
  iconName: "BadgeCheck",
  sort: 6,
  description: "Review and approve prepared remittances.",
} as const;

export const GOVERNMENT_LOANS_MONTH_END_CLOSE = {
  key: "month-end-close",
  title: "Month-End Close",
  slug: "government-loans-month-end-close",
  path: "/fm/government-loans/month-end-close",
  iconName: "CalendarCheck2",
  sort: 7,
  description: "Confirm payroll results and close the remittance month.",
} as const;

export const GOVERNMENT_LOANS_REPORTS = {
  key: "reports",
  title: "Reports",
  slug: "government-loans-reports",
  path: "/fm/government-loans/reports",
  iconName: "BarChart3",
  sort: 8,
  description: "Review loan ledgers, remittance reports, year-end summaries, and audit history.",
} as const;

export const GOVERNMENT_LOANS_MY_LOANS = {
  key: "my-loans",
  title: "My Loans",
  slug: "government-loans-my-loans",
  path: "/fm/government-loans/my-loans",
  iconName: "UserRound",
  sort: 9,
  description: "View your own government loans, deductions, notices, and disputes.",
} as const;

export const GOVERNMENT_LOANS_WORKSPACES = [
  GOVERNMENT_LOANS_DASHBOARD,
  GOVERNMENT_LOANS_LOAN_APPLICATIONS,
  GOVERNMENT_LOANS_LOANS,
  GOVERNMENT_LOANS_REMITTANCES,
  GOVERNMENT_LOANS_LOAN_APPROVAL,
  GOVERNMENT_LOANS_REMITTANCE_APPROVAL,
  GOVERNMENT_LOANS_MONTH_END_CLOSE,
  GOVERNMENT_LOANS_REPORTS,
  GOVERNMENT_LOANS_MY_LOANS,
] as const;

export type GovernmentLoansWorkspaceKey = (typeof GOVERNMENT_LOANS_WORKSPACES)[number]["key"];
export type GovernmentLoansWorkspace = Pick<
  (typeof GOVERNMENT_LOANS_WORKSPACES)[number],
  "key" | "title" | "path" | "description" | "iconName" | "sort"
>;

export type GovernmentLoansTab = { key: string; title: string };

export const GOVERNMENT_LOANS_TABS = {
  dashboard: [],
  "loan-applications": [
    { key: "requests", title: "Requests" },
    { key: "enrollment", title: "Enrollment" },
  ],
  loans: [
    { key: "register", title: "Register" },
    { key: "agency-balances", title: "Agency balances" },
    { key: "changes", title: "Changes" },
    { key: "onboarding-exits", title: "Onboarding & exits" },
    { key: "posting-disputes", title: "Posting disputes" },
    { key: "payroll-instructions", title: "Payroll instructions" },
  ],
  remittances: [
    { key: "to-remit", title: "To remit" },
    { key: "billing-reconciliation", title: "Billing reconciliation" },
    { key: "agencies", title: "Agencies" },
  ],
  "loan-approval": [
    { key: "loan-requests", title: "Loan requests" },
    { key: "enrollment-verification", title: "Enrollment verification" },
  ],
  "remittance-approval": [],
  "month-end-close": [
    { key: "close", title: "Checklist & close" },
    { key: "setup", title: "Period setup" },
  ],
  reports: [
    { key: "employee-ledger", title: "Employee loan ledger" },
    { key: "remittance-report", title: "Remittance report" },
    { key: "year-end-summary", title: "Year-end summary" },
    { key: "audit-trail", title: "Audit trail" },
  ],
  "my-loans": [],
} as const satisfies Record<GovernmentLoansWorkspaceKey, readonly GovernmentLoansTab[]>;
