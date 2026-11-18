import type { FinancialReports, ReportFilters, ReportKey, ReportScope, ReportsExportData } from "../report-types";
import { JOURNAL_STATUSES, matchesJournal, type JournalStatusFilter } from "../utils/journalFilters";
import { centsAmount, transactionCents } from "../utils/transactionDisplay";

export const REPORT_TITLES = {
  statement: "Reconciliation statement", aging: "Outstanding items aging", journal: "Adjusting entries journal",
  audit: "Audit trail", closedPeriods: "Closed periods",
} satisfies Record<ReportKey, string>;

export function isReportKey(value: unknown): value is ReportKey {
  return typeof value === "string" && Object.hasOwn(REPORT_TITLES, value);
}

const reportFilters: Record<ReportKey, ReadonlySet<string>> = {
  statement: new Set(), aging: new Set(["itemType", "bucket"]), journal: new Set(["search", "status"]),
  audit: new Set(["search", "action", "actorId", "fromDate", "toDate"]), closedPeriods: new Set(["periodMonth"]),
};

export function validPeriodMonth(value: string) {
  return !value || /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function validReportScope(scope: Record<string, unknown>) {
  const { report, filters, throughEventId, throughClosureId } = scope;
  const boundary = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
  if (report === undefined) return filters === undefined && throughEventId === undefined && throughClosureId === undefined;
  if (!isReportKey(report)) return false;
  if (report === "audit" ? !boundary(throughEventId) : throughEventId !== undefined) return false;
  if (report === "closedPeriods" ? !boundary(throughClosureId) : throughClosureId !== undefined) return false;
  return filters === undefined || filters !== null && typeof filters === "object" && !Array.isArray(filters)
    && Object.entries(filters).every(([key, value]) => reportFilters[report].has(key) && typeof value === "string" && value.length <= 200);
}

export function appendReportScope(query: URLSearchParams, scope?: ReportScope) {
  if (!scope) return;
  query.set("report", scope.report);
  for (const [key, value] of Object.entries(scope.filters ?? {})) if (value.trim()) query.set(key, value.trim());
  if (scope.throughEventId !== undefined) query.set("throughEventId", String(scope.throughEventId));
  if (scope.throughClosureId !== undefined) query.set("throughClosureId", String(scope.throughClosureId));
}

export function filterAging(aging: FinancialReports["aging"], { itemType, bucket }: ReportFilters) {
  if (!itemType && !bucket) return aging;
  const items = aging.items.filter(item => (!itemType || item.type === (itemType === "DIT" ? "Deposit in transit" : "Outstanding check"))
    && (!bucket || item.bucket === Number(bucket)));
  const totals = aging.buckets.map(() => 0n);
  let net = 0n;
  for (const item of items) {
    const amount = transactionCents(item.amount);
    net += amount;
    if (item.bucket !== null) totals[item.bucket] += amount;
  }
  return { ...aging, items, count: items.length, net: centsAmount(net), totals: totals.map(value => aging.available ? centsAmount(value) : null) };
}

export function filterJournal(journal: FinancialReports["journal"], filters: ReportFilters) {
  const search = filters.search ?? "", status = filters.status || "ALL";
  if (!search.trim() && status === "ALL") return journal;
  const entries = journal.entries.filter(entry => matchesJournal(entry, search, status as JournalStatusFilter));
  let debit = 0n, credit = 0n;
  for (const entry of entries) for (const line of entry.lines) {
    debit += transactionCents(line.debit);
    credit += transactionCents(line.credit);
  }
  return { ...journal, entries, totals: { debit: centsAmount(debit), credit: centsAmount(credit) } };
}

export function filteredExport(data: ReportsExportData): ReportsExportData {
  if (data.report === "aging") return { ...data, aging: filterAging(data.aging, data.filters) };
  if (data.report === "journal") return { ...data, journal: filterJournal(data.journal, data.filters) };
  return data;
}

export function reportFilterDescription(filters: ReportFilters) {
  const parts = [
    filters.itemType && (filters.itemType === "DIT" ? "Deposits in transit" : "Outstanding checks"),
    filters.bucket && ["0–30 days", "31–90 days", "91–180 days", "Over 180 days"][Number(filters.bucket)],
    filters.search && `Search ${filters.search}`, filters.status && JOURNAL_STATUSES.find(option => option.value === filters.status)?.label,
    filters.action && `Action ${filters.action}`, filters.actorId && `User #${filters.actorId}`,
    filters.fromDate && `From ${filters.fromDate} PHT`, filters.toDate && `Through ${filters.toDate} PHT`,
    filters.periodMonth && `Period ended ${filters.periodMonth}`,
  ].filter(Boolean);
  return parts.length ? `Filters: ${parts.join(" · ")}` : "All items in the selected report.";
}
