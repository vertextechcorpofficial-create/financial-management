import { phtToday } from "../pht";

export const COMPANY_PARAM = "company";
export const PERIOD_PARAM = "period";
export const COMPARE_PARAM = "compare";
export const CURRENCY_PARAM = "currency";
export const FX_PHP_PER_USD = 56;
export const MA_FILTER_STORAGE_KEY = "ma_global_filters_v1";
export const MA_FILTERS_COOKIE = "ma_filters";

export type CompareMode = "target" | "mom" | "yoy" | "ytd";
export type CurrencyCode = "PHP" | "USD";

export interface PersistedMaFilters {
  company?: string;
  period?: string;
  compare?: CompareMode;
  currency?: CurrencyCode;
}

function readCookieFilters(): PersistedMaFilters {
  if (typeof document === "undefined") return {};
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${MA_FILTERS_COOKIE}=`));
    if (!match) return {};
    const raw = decodeURIComponent(match.slice(MA_FILTERS_COOKIE.length + 1));
    const parsed = JSON.parse(raw) as PersistedMaFilters;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readPersistedMaFilters(): PersistedMaFilters {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MA_FILTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedMaFilters;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    // Fall back to cookie
  }
  return readCookieFilters();
}

export function writePersistedMaFilters(patch: PersistedMaFilters): void {
  if (typeof window === "undefined") return;
  try {
    const current = readPersistedMaFilters();
    const next: PersistedMaFilters = { ...current, ...patch };
    const serialized = JSON.stringify(next);
    window.localStorage.setItem(MA_FILTER_STORAGE_KEY, serialized);
    document.cookie = `${MA_FILTERS_COOKIE}=${encodeURIComponent(serialized)}; path=/; max-age=2592000; SameSite=Lax`;
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: "target", label: "vs Target" },
  { value: "mom", label: "vs Prior month" },
  { value: "yoy", label: "vs Last year" },
  { value: "ytd", label: "YTD avg vs Target" },
];

export const TV_ROUTES: Array<{ path: string; label: string }> = [
  { path: "/fm/management-analytics/analytics-overview", label: "Overview" },
  { path: "/fm/management-analytics/analytics-variance", label: "Variance Protocol" },
  { path: "/fm/management-analytics/analytics-cadence", label: "Reporting Cadence" },
];

export const ERP_LIVE_KEYS = new Set([
  "dist.opex",
  "dist.ncr",
  "dist.capa",
  "dist.abs",
  "dist.tardy",
  "dist.ot",
  "dist.fill",
  "dist.otif",
  "dist.pick",
  "dist.freight",
]);

export const ERP_KPI_QUALIFIERS: Record<string, "STAND_IN" | "PARTIAL"> = {
  "dist.pick": "STAND_IN",
  "dist.freight": "PARTIAL",
};

export const ERP_INPUT_LABELS: Record<string, string> = {
  auditsSubmitted: "Submitted SOP / 5S audits",
  correctiveActionsRaised: "Corrective actions raised",
  closedActions: "Closed corrective actions",
  openActions: "Still open",
  overdueActions: "Overdue actions",
  oldestOpenDays: "Oldest open (days)",
  actualOpex: "Actual opex (₱)",
  fromPostedDisbursements: "Posted disbursements",
  fromAdjustingEntries: "Posted adjusting entries",
  fromCollections: "Posted collections",
  releasedNotPosted: "Released, not yet posted",
  otherUnposted: "Other unposted disbursements",
  asInIncomeStatement: "Income statement basis (comparison)",
  approvedBudget: "Approved monthly budget",
  budgetVariancePercent: "Budget variance (%)",
  employees: "Employees with a clock-in",
  scheduledShifts: "Scheduled shifts",
  shiftsWithClockIn: "Shifts with clock-in",
  shiftsOnApprovedLeave: "Shifts on approved leave",
  absences: "Unexcused absences",
  absencesWithPendingLeave: "Absences with pending leave",
  onCallShifts: "On-call shifts",
  clockInsOnNonShiftDays: "Clock-ins on rest/holidays (ignored)",
  employeesWithoutDepartmentSchedule: "Employees without dept schedule",
  countedThrough: "Counted through",
  employeesInHrRecords: "Active employees in HR",
  employeesNeverClockedIn: "Employees who never clocked in",
  clockIns: "Clock-ins with schedule",
  lateClockIns: "Late clock-ins (>10 min)",
  lateMinutes: "Total late minutes",
  clockInsWithoutSchedule: "Clock-ins without schedule (excluded)",
  onCallDays: "On-call schedule days",
  lateByHrReportRule: "Late count under HR report rule",
  regularPaidMinutes: "Regular scheduled minutes",
  scheduledDays: "Scheduled days",
  approvedOvertimeMinutes: "Approved overtime minutes",
  approvedRequests: "Approved overtime requests",
  pendingOvertimeMinutes: "Pending overtime minutes (excluded)",
  pendingRequests: "Pending overtime requests",
  orders: "Orders evaluated",
  lines: "Order lines",
  linesInFull: "Lines served in full",
  orderedQty: "Ordered quantity",
  servedQtyCapped: "Served quantity (capped)",
  quantityFillRate: "Quantity fill rate (%)",
  linesOverServed: "Lines served over ordered",
  ordersOnTimeInFull: "Orders on-time & in-full",
  ordersOnTime: "Orders delivered on time",
  ordersInFull: "Orders filled in full",
  ordersLate: "Late orders",
  ordersNotFulfilled: "Unfulfilled orders",
  ordersWithoutPromisedDate: "Orders lacking promised date (excluded)",
  averageDaysLate: "Average days late",
  invoiceLinesPicked: "Invoice lines picked",
  wrongItemLines: "Wrong-item return lines",
  excessItemLines: "Excess-item return lines",
  mispickedLinesPending: "Pending return lines",
  returnedQuantity: "Returned quantity",
  trips: "Posted delivery trips",
  tripCost: "Recorded trip cost (₱)",
  boxesShipped: "Boxes shipped",
  linesWithoutBoxSize: "Lines missing box size (excluded)",
  quantityWithoutBoxSize: "Quantity missing box size (excluded)",
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPeriod(value: string | null | undefined): value is string {
  return !!value && MONTH.test(value);
}

export function recentPeriods(count = 24): string[] {
  const [year, month] = phtToday().split("-").map(Number);
  return Array.from({ length: count }, (_, back) => {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function isPhpUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  return unit.includes("₱") || unit.toUpperCase().includes("PHP");
}

export function convertPhpValue(
  value: number | null | undefined,
  unit: string | null | undefined,
  currency: CurrencyCode,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (currency !== "USD" || !isPhpUnit(unit)) return value;
  return value / FX_PHP_PER_USD;
}

export function displayUnitForCurrency(
  unit: string | null | undefined,
  currency: CurrencyCode,
): string {
  if (!unit) return "";
  if (currency !== "USD" || !isPhpUnit(unit)) return unit;
  return unit.replace(/₱/g, "$").replace(/PHP/gi, "USD");
}
