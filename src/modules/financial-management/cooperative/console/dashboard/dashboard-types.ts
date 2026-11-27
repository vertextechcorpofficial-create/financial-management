export type DashboardUnavailable = { state: "pending" | "failed"; message: string };
export type DashboardSection<T> =
  | { state: "ready" | "empty"; data: T }
  | DashboardUnavailable;

export type DashboardMonth = {
  key: string;
  start: string;
  end: string;
  label: string;
  name: string;
};

export type DashboardTransaction = {
  id: string;
  date: string;
  member: string;
  type: string;
  channel: string;
  reference: string;
  amount: string;
};

export type DashboardWorkItem = {
  id: string;
  date: string;
  kind: "membership" | "loan" | "withdrawal" | "release" | "clearance";
  member: string;
  reference: string;
  amount: string | null;
  href?: string;
};

export type DashboardLinks = {
  approvals?: string;
  aging?: string;
  journal?: string;
  members?: string;
  loans?: string;
};

export type DashboardSummary = {
  asOf: string;
  nextCutoff: string;
  months: DashboardMonth[];
  members: DashboardSection<{ active: number; applying: number; notJoined: number }>;
  savings: DashboardSection<{ total: string; lastMonthChange: string; balances: string[] }>;
  portfolio: DashboardSection<{
    activeLoans: number;
    receivables: string;
    pastDue: string;
    penalties: string;
    pastDuePercent: string;
    products: { label: string; loans: number; amount: string }[];
    aging: { label: string; amount: string }[];
  }>;
  moneyIn: DashboardSection<{ deposits: string[]; loanPayments: string[] }>;
  work: DashboardSection<{
    approvals: number;
    releases: number;
    clearances: number;
    waiting: DashboardWorkItem[];
  }>;
  recentTransactions: DashboardSection<DashboardTransaction[]>;
  links: DashboardLinks;
};
