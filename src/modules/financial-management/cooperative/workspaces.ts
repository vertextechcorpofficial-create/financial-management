export const COOPERATIVE_PARENT = {
  title: "Cooperative",
  slug: "cooperative",
  path: "/fm/cooperative",
  iconName: "Users",
} as const;

export const COOPERATIVE_DASHBOARD = {
  key: "dashboard",
  title: "Dashboard",
  slug: "cooperative-dashboard",
  path: "/fm/cooperative/dashboard",
  iconName: "LayoutDashboard",
  sort: 1,
} as const;

export const COOPERATIVE_MEMBERS = {
  key: "members",
  title: "Members",
  slug: "cooperative-members",
  path: "/fm/cooperative/members",
  iconName: "Users",
  sort: 2,
} as const;

export const COOPERATIVE_LOANS = {
  key: "loans",
  title: "Loans",
  slug: "cooperative-loans",
  path: "/fm/cooperative/loans",
  iconName: "HandCoins",
  sort: 3,
} as const;

export const COOPERATIVE_APPROVALS = {
  key: "approvals",
  title: "Approvals",
  slug: "cooperative-approvals",
  path: "/fm/cooperative/approvals",
  iconName: "ClipboardCheck",
  sort: 4,
} as const;

export const COOPERATIVE_TRANSACTIONS = {
  key: "transactions",
  title: "Transactions",
  slug: "cooperative-transactions",
  path: "/fm/cooperative/transactions",
  iconName: "ArrowLeftRight",
  sort: 5,
} as const;

export const COOPERATIVE_EXIT_CLEARANCE = {
  key: "exit-clearance",
  title: "Exit clearance",
  slug: "cooperative-exit-clearance",
  path: "/fm/cooperative/exit-clearance",
  iconName: "LogOut",
  sort: 6,
} as const;

export const COOPERATIVE_REPORTS = {
  key: "reports",
  title: "Reports",
  slug: "cooperative-reports",
  path: "/fm/cooperative/reports",
  iconName: "BarChart3",
  sort: 7,
} as const;

export const COOPERATIVE_YEAR_END = {
  key: "year-end-dividends",
  title: "Year-end dividends",
  slug: "cooperative-year-end-dividends",
  path: "/fm/cooperative/year-end-dividends",
  iconName: "PieChart",
  sort: 8,
} as const;

export const COOPERATIVE_POLICIES = {
  key: "policies",
  title: "Policies",
  slug: "cooperative-policies",
  path: "/fm/cooperative/policies",
  iconName: "Settings",
  sort: 9,
} as const;

export const COOPERATIVE_WORKSPACES = [
  COOPERATIVE_DASHBOARD,
  COOPERATIVE_MEMBERS,
  COOPERATIVE_LOANS,
  COOPERATIVE_APPROVALS,
  COOPERATIVE_TRANSACTIONS,
  COOPERATIVE_EXIT_CLEARANCE,
  COOPERATIVE_REPORTS,
  COOPERATIVE_YEAR_END,
  COOPERATIVE_POLICIES,
] as const;

export type CooperativeWorkspaceKey = (typeof COOPERATIVE_WORKSPACES)[number]["key"];
export type CooperativeWorkspace = Pick<(typeof COOPERATIVE_WORKSPACES)[number], "key" | "title" | "path">;
