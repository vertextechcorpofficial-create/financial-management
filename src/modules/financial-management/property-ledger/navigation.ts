export const LEDGER_PAGES = [
  { slug: "dashboard", title: "Dashboard", heading: "Portfolio overview", group: "", icon: "LayoutDashboard" },
  { slug: "land-register", title: "Land register", heading: "Land register", group: "Registrations", icon: "Landmark" },
  { slug: "building-register", title: "Building register", heading: "Building register", group: "Registrations", icon: "Building2" },
  { slug: "building-depreciation", title: "Building depreciation", heading: "Building depreciation schedule", group: "Schedules", icon: "TrendingDown" },
  { slug: "land-appreciation", title: "Land appreciation", heading: "Land appreciation schedule", group: "Schedules", icon: "TrendingUp" },
  { slug: "combined", title: "Combined", heading: "Combined schedule", group: "Schedules", icon: "ChartNoAxesCombined" },
  { slug: "accounting-policies", title: "Accounting policies", heading: "Accounting policies", group: "Settings", icon: "Settings2" },
] as const;
export type LedgerPage = typeof LEDGER_PAGES[number]["slug"];
export const LEDGER_BASE = "/fm/property-ledger";
export function ledgerPage(pathname: string): LedgerPage {
  return LEDGER_PAGES.find(page => pathname === `${LEDGER_BASE}/${page.slug}`)?.slug ?? "dashboard";
}
export function ledgerPath(page: LedgerPage) { return `${LEDGER_BASE}/${page}`; }
