export const INVESTMENT_DONATIONS_PARENT = {
    title: "Capital & Giving Ledger",
    // The deployed Directus registry uses the renamed parent slug; child paths
    // intentionally retain the existing investment-donations URL segment.
    slug: "capital-giving-ledger",
    path: "/fm/investment-donations",
    iconName: "Landmark",
};
const definitions = [
    ["overview", "Overview", "Operations", "LayoutDashboard"],
    ["transactions", "Transactions", "Operations", "List"],
    ["inflows-investing", "Inflows & investing", "Operations", "ArrowDownToLine"],
    ["capital-stock", "Capital stock", "Operations", "Users"],
    ["portfolio-rebalancing", "Portfolio & rebalancing", "Operations", "ChartPie"],
    ["charitable-giving", "Charitable giving", "Operations", "HeartHandshake"],
    ["tax-compliance", "Tax compliance", "Compliance", "Receipt"],
    ["monthly-reconciliation-reconciliator", "Monthly reconciliation - Reconciliator", "Compliance", "Scale"],
    ["monthly-reconciliation-approver", "Monthly reconciliation - Approver", "Compliance", "ClipboardCheck"],
    ["period-close", "Period close", "Compliance", "Lock"],
    ["annual-review-preparer", "Annual review - Preparer / reviewer", "Compliance", "ClipboardList"],
    ["annual-review-approver", "Annual review - Approver", "Compliance", "ClipboardCheck"],
    ["policy-targets", "Policy & targets", "Setup", "Settings"],
];
const CHILD_SLUG_PREFIX = "investment-donations";
export const INVESTMENT_DONATIONS_WORKSPACES = definitions.map(([key, title, group, iconName], index) => ({
    key, title, group, iconName, sort: index + 1,
    slug: `${CHILD_SLUG_PREFIX}-${key}`,
    path: `${INVESTMENT_DONATIONS_PARENT.path}/${CHILD_SLUG_PREFIX}-${key}`,
}));
