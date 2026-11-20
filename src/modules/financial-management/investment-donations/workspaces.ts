export const INVESTMENT_DONATIONS_PARENT = {
  title: "Capital & Giving Ledger",
  slug: "investment-donations",
  path: "/fm/investment-donations",
  iconName: "Landmark",
} as const;

const definitions = [
  ["overview", "Overview", "Operations", "LayoutDashboard"],
  ["transactions", "Transactions", "Operations", "List"],
  ["inflows-investing", "Inflows & investing", "Operations", "ArrowDownToLine"],
  ["capital-stock", "Capital stock", "Operations", "Users"],
  ["portfolio-rebalancing", "Portfolio & rebalancing", "Operations", "ChartPie"],
  ["charitable-giving", "Charitable giving", "Operations", "HeartHandshake"],
  ["tax-compliance", "Tax compliance", "Compliance", "Receipt"],
  ["monthly-reconciliation", "Monthly reconciliation", "Compliance", "Scale"],
  ["period-close", "Period close", "Compliance", "Lock"],
  ["annual-review", "Annual review", "Compliance", "ClipboardCheck"],
  ["policy-targets", "Policy & targets", "Setup", "Settings"],
] as const;

export type WorkspaceKey = typeof definitions[number][0];
export const INVESTMENT_DONATIONS_WORKSPACES = definitions.map(([key, title, group, iconName], index) => ({
  key, title, group, iconName, sort: index + 1,
  slug: `${INVESTMENT_DONATIONS_PARENT.slug}-${key}`,
  path: `${INVESTMENT_DONATIONS_PARENT.path}/${INVESTMENT_DONATIONS_PARENT.slug}-${key}`,
}));
