import type { AuditEvent, AuditFilters, AuditHistoryPage, ClosedPeriod, FinancialReports, HistoryPage, ReportFilters, ReportKey, ReportScope, ReportsExportData, ReportViewData } from "../report-types";
import type { ReconciliationPeriod } from "../setup-types";
import { appendReportScope } from "../services/reportSelection";
import { SetupError } from "./bankReconciliationSetupApi";

export function getFinancialReports(id: number, closureId?: number, signal?: AbortSignal): Promise<FinancialReports>;
export function getFinancialReports(id: number, closureId: number | undefined, signal: AbortSignal, report: ReportKey): Promise<ReportViewData>;
export async function getFinancialReports(id: number, closureId?: number, signal?: AbortSignal, report?: ReportKey): Promise<FinancialReports | ReportViewData> {
  const query = new URLSearchParams();
  if (closureId) query.set("closureId", String(closureId));
  if (report) query.set("report", report);
  const response = await fetch(`/api/fm/treasury/bank-reconciliation/periods/${id}/reports${query.size ? `?${query}` : ""}`, { credentials: "same-origin", cache: "no-store", signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new SetupError(response.status, data?.message || "Unable to load financial reports.");
  if (!data) throw new SetupError(503, "The service returned an invalid response.");
  if (report && (data.report !== report || data.period?.id !== id
    || (report === "statement" && (!Array.isArray(data.statement) || !data.reconciliation))
    || (report === "aging" && !Array.isArray(data.aging?.items))
    || (report === "journal" && !Array.isArray(data.journal?.entries)))) {
    throw new SetupError(503, "The service did not return the selected report. Please retry.");
  }
  return data;
}

async function history<T>(id: number, section: string, page: number, boundary: string, through?: number, signal?: AbortSignal, filters?: ReportFilters): Promise<HistoryPage<T>> {
  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (through !== undefined) query.set(boundary, String(through));
  if (filters) for (const [key, value] of Object.entries(filters)) if (value.trim()) query.set(key, value.trim());
  const response = await fetch(`/api/fm/treasury/bank-reconciliation/periods/${id}/reports/${section}?${query}`, { credentials: "same-origin", cache: "no-store", signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new SetupError(response.status, data?.message || "Unable to load report history.");
  if (!data || !Array.isArray(data.items)) throw new SetupError(503, "The service returned an invalid history response.");
  return data;
}
export const getAuditHistory = (id: number, page: number, through?: number, signal?: AbortSignal, filters?: AuditFilters) => history<AuditEvent>(id, "audit", page, "throughEventId", through, signal, filters) as Promise<AuditHistoryPage>;
export const getClosedPeriods = (id: number, page: number, through?: number, signal?: AbortSignal, periodMonth = "") => history<ClosedPeriod>(id, "closed-periods", page, "throughClosureId", through, signal, { periodMonth });

export async function getReportsCopyData(period: ReconciliationPeriod, signal?: AbortSignal, scope?: ReportScope): Promise<ReportsExportData> {
  const query = new URLSearchParams({ version: String(period.version), bankVersion: String(period.bank.version), format: "text" });
  if (period.lifecycle?.closureId) query.set("closureId", String(period.lifecycle.closureId));
  appendReportScope(query, scope);
  const response = await fetch(`/api/fm/treasury/bank-reconciliation/periods/${period.id}/reports/export-data?${query}`, { credentials: "same-origin", cache: "no-store", signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new SetupError(response.status, data?.message || "Unable to prepare the copied report.");
  if (!data || data.report !== scope?.report
    || ((!scope || scope.report === "audit") && !Array.isArray(data.audit))
    || ((!scope || scope.report === "closedPeriods") && !Array.isArray(data.closedPeriods))
    || (scope?.report === "audit" && data.throughEventId !== scope.throughEventId)
    || (scope?.report === "closedPeriods" && data.throughClosureId !== scope.throughClosureId)) {
    throw new SetupError(503, "The service returned an invalid report snapshot.");
  }
  return data;
}
export async function downloadReportsExport(period: ReconciliationPeriod, format: "xlsx" | "pdf", signal?: AbortSignal, scope?: ReportScope) {
  const response = await fetch(`/api/fm/treasury/bank-reconciliation/periods/${period.id}/reports/exports/${format}`, { method: "POST", credentials: "same-origin", cache: "no-store", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: period.version, bankVersion: period.bank.version, ...(period.lifecycle?.closureId ? { closureId: period.lifecycle.closureId } : {}), ...scope }) });
  if (!response.ok) { const data = await response.json().catch(() => null); throw new SetupError(response.status, data?.message || "Unable to export Reports."); }
  if (!response.headers.get("Content-Type")?.includes(format === "pdf" ? "application/pdf" : "spreadsheetml")) throw new SetupError(503, "The service did not return an export file. Please retry.");
  const blob = await response.blob(); signal?.throwIfAborted(); const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || `Bank-rec_Reports.${format}`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
