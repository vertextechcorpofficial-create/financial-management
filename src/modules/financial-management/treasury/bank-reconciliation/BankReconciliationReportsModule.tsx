"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getBankReconciliationContext } from "./providers/bankReconciliationReferencesApi";
import { useFinancialReports } from "./hooks/useFinancialReports";
import { useReportsExports } from "./hooks/useReportsExports";
import { PeriodHistoryChoice } from "./components/PeriodHistoryChoice";
import { AuditTrailReport, ClosedPeriodsReport } from "./components/HistoryReports";
import { AgingReport, JournalReport, StatementReport } from "./components/FinancialReports";
import { CopyReportButton } from "./components/CopyReportButton";
import { BankAccountLabel } from "./components/BankAccountLabel";
import { ReportsSkeleton } from "./components/BankReconciliationSkeletons";
import type { ReportContext, ReportFilters, ReportScope } from "./report-types";
import { exportTime } from "./services/reconcileExport";
import { REPORT_TITLES, isReportKey } from "./services/reportSelection";

function ReportPeriod({ period, entity }: ReportContext) {
  return <section aria-label="Report period" className="min-w-0 space-y-1 text-sm">
    <p className="break-words"><span className="text-muted-foreground">Entity: </span><span className="font-medium">{entity?.name || "Entity not set"}</span></p>
    <div className="flex min-w-0 items-baseline gap-1 text-muted-foreground"><span className="shrink-0">Bank account:</span><BankAccountLabel bank={period.bank} /></div>
    <p className="flex flex-wrap gap-x-3 text-muted-foreground"><span>Currency: {period.currency}</span><span>{period.periodEnd ? "Period ended " + period.periodEnd : "Period end not set"}</span><span>Status: {period.status === "CLOSED" ? "Closed" : "Open"}</span></p>
    {period.status === "CLOSED" && <p className="break-words">Closed snapshot · revision {period.lifecycle?.revision ?? "unavailable"}{period.lifecycle?.closedBy && " · " + period.lifecycle.closedBy.name}{period.lifecycle?.closedAt && " · " + exportTime(period.lifecycle.closedAt)}. Financial data is preserved as of closure.</p>}
    {[...period.ledgerBlockers, period.setupWarning].filter(Boolean).map(issue => <p key={issue} className="text-amber-700 dark:text-amber-400">{issue}</p>)}
    {period.statementCheck?.state === "WARNING" && <p className="text-amber-700 dark:text-amber-400">{period.statementCheck.message}</p>}
  </section>;
}

export default function BankReconciliationReportsModule() {
  const [authorized, setAuthorized] = useState(false), [accessError, setAccessError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    getBankReconciliationContext(controller.signal).then(value => {
      if (!value.workspaces.some(w => w.key === "reports")) throw new Error("Reports module access is required.");
      setAuthorized(true);
    }).catch(e => { if (!controller.signal.aborted) setAccessError(e.message); });
    return () => controller.abort();
  }, []);

  const reports = useFinancialReports(authorized), { report, data, loading, context } = reports;
  const period = data?.period, historyPeriod = context?.period;
  const exports = useReportsExports(report, period), exporting = Boolean(exports.busy);
  const periodKey = historyPeriod ? [historyPeriod.id, historyPeriod.lifecycle?.closureId].join(":") : "";
  const [savedFilters, setFilters] = useState<{ periodKey: string; aging: ReportFilters; journal: ReportFilters }>({ periodKey: "", aging: {}, journal: {} });
  const filters = savedFilters.periodKey === periodKey ? savedFilters : { periodKey, aging: {}, journal: {} };
  if (filters !== savedFilters) setFilters(filters);

  function fileFeedback(target: ReportScope["report"] | "all") {
    if (exports.target !== target || exports.action === "copy") return null;
    return <>
      {exports.error && <p role="alert" className="max-w-sm break-words text-sm text-destructive">{exports.error}</p>}
      {exports.message && <p role="status" className="max-w-sm break-words text-sm text-muted-foreground">{exports.message}</p>}
    </>;
  }

  function actions(scope: ReportScope, unavailable = false, refresh: () => void = reports.refresh) {
    const name = REPORT_TITLES[scope.report], active = exports.target === scope.report;
    const disabled = !period || loading || exporting || unavailable;
    return <div role="group" aria-label={name + " exports"} className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <CopyReportButton id={"copy-report-" + scope.report} name={name} busy={active && exports.busy === "copy"} disabled={disabled}
          feedback={active && exports.action === "copy" ? exports : undefined}
          onClick={() => void exports.run("copy", scope)} onRetry={() => void exports.run("copy", scope)} onRefresh={refresh} />
        <Button type="button" variant="outline" disabled={disabled} onClick={() => void exports.run("xlsx", scope)}>{active && exports.busy === "xlsx" ? "Generating Excel…" : "Export to Excel"}</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => void exports.run("pdf", scope)}>{active && exports.busy === "pdf" ? "Generating PDF…" : "Download PDF"}</Button>
      </div>
      {fileFeedback(scope.report)}
      {active && exports.action !== "copy" && exports.recovery === "refresh" && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={refresh}>Refresh report</Button>}
    </div>;
  }

  if (accessError) return <p role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">{accessError}</p>;
  if (!authorized) return <ReportsSkeleton label="Loading Reports" />;

  return <section aria-label="Bank reconciliation Reports" className="min-w-0 space-y-6" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <div className="flex flex-wrap gap-2">
        {report !== "audit" && report !== "closedPeriods" && <Button type="button" variant="outline" disabled={!period || loading || exporting} onClick={reports.refresh}>Refresh data</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="outline" disabled={!period || loading || exporting}>Export all reports</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void exports.run("xlsx")}>Export all to Excel</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exports.run("pdf")}>Download all as PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <PeriodHistoryChoice period={period} disabled={exporting} onSelect={reports.selectPeriod} />
      {fileFeedback("all")}
    </div>
    <Dialog open={Boolean(exports.manual)} onOpenChange={open => { if (!open) exports.dismiss(); }}>
      <DialogContent className="max-w-3xl" onCloseAutoFocus={event => {
        const button = document.getElementById("copy-report-" + exports.target);
        if (button) { event.preventDefault(); button.focus({ preventScroll: true }); }
      }}>
        <DialogHeader><DialogTitle>Copy report text</DialogTitle><DialogDescription>Your browser blocked automatic copying. Select the text below and use Ctrl+C or your device’s copy command.</DialogDescription></DialogHeader>
        <Textarea aria-label="Report text to copy" readOnly value={exports.manual} className="h-80 font-mono text-xs" onFocus={event => event.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={() => exports.dismiss()}>Close</Button>
      </DialogContent>
    </Dialog>
    <Tabs value={report} activationMode="manual" className="min-w-0 gap-4" onValueChange={value => { if (isReportKey(value)) reports.selectReport(value); }}>
      <div className="max-w-full overflow-x-auto py-1">
        <TabsList aria-label="Bank reconciliation reports" className="w-max">
          {Object.entries(REPORT_TITLES).map(([key, title]) => <TabsTrigger key={key} value={key} className="shrink-0">{title}</TabsTrigger>)}
        </TabsList>
      </div>
      <TabsContent value={report} className="min-w-0 space-y-4">
        {reports.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"><span>{reports.error}</span><Button type="button" variant="outline" disabled={loading} onClick={reports.refresh}>Retry reports</Button></div>}
        {loading ? <ReportsSkeleton label={"Loading " + REPORT_TITLES[report].toLowerCase()} /> : !data && !reports.error && <p className="rounded-lg border p-6 text-sm text-muted-foreground">Choose a saved reconciliation period to view its reports.</p>}
        {data && <ReportPeriod period={data.period} entity={data.entity} />}
        {data?.report === "statement" && <StatementReport data={data} actions={actions({ report: "statement" })} />}
        {data?.report === "aging" && <AgingReport data={data} actions={actions({ report: "aging", filters: filters.aging })} filters={filters.aging} changeFilters={aging => setFilters({ ...filters, aging })} />}
        {data?.report === "journal" && <JournalReport data={data} actions={actions({ report: "journal", filters: filters.journal })} filters={filters.journal} changeFilters={journal => setFilters({ ...filters, journal })} />}
        {historyPeriod && <AuditTrailReport key={"audit:" + historyPeriod.id} periodId={historyPeriod.id} active={data?.report === "audit"} actions={actions} refreshContext={reports.refresh} />}
        {historyPeriod && <ClosedPeriodsReport key={"closed:" + historyPeriod.bankId} periodId={historyPeriod.id} active={data?.report === "closedPeriods"} actions={actions} refreshContext={reports.refresh} onView={(id, closureId) => { void reports.selectPeriod(id, closureId, "statement"); }} />}
      </TabsContent>
    </Tabs>
  </section>;
}
