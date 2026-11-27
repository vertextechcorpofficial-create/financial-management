"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { PERIOD_PARAM, isPeriod } from "./analytics-screens";
import { BoardHeader, Callout, ErpTags, MicroLabel, Panel, PanelHead, Stat } from "./BoardKit";
import { ErpSlaContextStrip } from "./ErpSlaContextStrip";
import { Meter, StackBar, type Tone } from "./Charts";
import { ExceptionDetailDialog } from "./ExceptionDetailDialog";
import { ExceptionTable } from "./ExceptionTable";
import { Pager } from "./Pager";
import { StatusBadge } from "./StatusBadge";
import { VarianceCalculator } from "./VarianceCalculator";
import { VarianceFilters } from "./VarianceFilters";

import { EXCEPTION_PAGE_SIZE } from "../constants";
import { useVariance } from "../hooks/useVariance";
import { phtToday } from "../pht";

const STAGES = [
  { key: "OPEN", label: "Still open", tone: "warning" as Tone, hint: "No memo filed yet" },
  { key: "MONITORING", label: "Monitoring", tone: "info" as Tone, hint: "Memo filed, waiting on readings" },
  { key: "ESCALATED", label: "Escalated", tone: "danger" as Tone, hint: "Past the memo deadline" },
  { key: "RECURRENCE", label: "Recurrence", tone: "primary" as Tone, hint: "Breached again after a close" },
  { key: "CLOSED", label: "Closed", tone: "success" as Tone, hint: "Within tolerance and signed off" },
];

export function VarianceModule() {
  const variance = useVariance(EXCEPTION_PAGE_SIZE);
  const searchParams = useSearchParams();
  const requestedPeriod = searchParams.get(PERIOD_PARAM);
  const { board } = variance;
  const period = isPeriod(requestedPeriod) ? requestedPeriod : phtToday().slice(0, 7);
  const { policy } = board;
  const failedRead = Boolean(variance.error) && !variance.hasRead;

  const counts = {
    OPEN: board.counts.OPEN ?? 0,
    MONITORING: board.counts.MONITORING ?? 0,
    ESCALATED: board.counts.ESCALATED ?? 0,
    RECURRENCE: board.counts.RECURRENCE ?? 0,
    CLOSED: board.counts.CLOSED ?? 0,
  };
  const closedShare = board.total > 0 ? (counts.CLOSED / board.total) * 100 : 0;
  const provisionalList = board.provisional ?? [];

  const ruleText = policy.sustainedRule
    ? `Percentage KPIs confirm after ${policy.confirmPeriods} ${
        policy.confirmPeriods === 1 ? "period" : "periods"
      } in a row over threshold, or at once at ${policy.spikeMultiple}× threshold.`
    : "Any single period over threshold confirms a breach.";
  const deadlineText = `Memos are due ${policy.memoDeadlineDays} business days after period close. Absolute limits confirm immediately.`;

  const handleScan = async () => {
    try {
      const result = await variance.runScan(period);
      toast.success(
        result.created === 0
          ? `${result.period}: nothing new, ${result.skipped} ${result.skipped === 1 ? "exception" : "exceptions"} already on the board.`
          : `${result.period}: ${result.created} exception${result.created === 1 ? "" : "s"} recorded.`,
      );
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The scan could not be completed.");
    }
  };

  const handleEscalate = async () => {
    try {
      const res = await variance.runEscalate();
      toast.success(`Escalation sweep complete: ${res.level1} to GM, ${res.level2} to Group ExCo.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Escalation sweep failed.");
    }
  };

  return (
    <div className="space-y-4">
      <BoardHeader
        eyebrow="Management Analytics · Remediation"
        title="Variance Protocol"
        subtitle="Each confirmed breach needs a root-cause memo and an accountable owner position by the deadline. Missing memos escalate to the company GM, then to Group ExCo."
        meta={
          failedRead ? undefined : (
            <>
              <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
                As of {board.asOf || "today"}
              </span>
              <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
                {board.open} {board.open === 1 ? "open" : "open"}
              </span>
              <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
                {board.overdue} past deadline
              </span>
            </>
          )
        }
        right={
          <div className="flex flex-wrap items-center gap-2">
            {board.overdue > 0 ? (
              <Button variant="outline" className="min-h-11 gap-1.5 md:min-h-0" onClick={handleEscalate} disabled={variance.isSaving}>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Escalate overdue
              </Button>
            ) : null}
            <Button className="min-h-11 gap-2 md:min-h-0" onClick={handleScan} disabled={variance.isScanning}>
              <ScanSearch className="h-4 w-4" />
              {variance.isScanning ? "Scanning…" : `Scan ${period}`}
            </Button>
          </div>
        }
      />

      <ErpSlaContextStrip period={period} />

      {variance.error ? (
        <Callout tone="danger" title="The board could not be read">
          {variance.error}
          {failedRead
            ? " Nothing is drawn from that read, because an empty register and a clean month look the same."
            : " Figures below reflect the last successful read."}
        </Callout>
      ) : null}

      {failedRead ? null : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead
                title="Variance calculator"
                description="Test a reading against its target under the policy in force."
              />
              <div className="border-t border-border/60" />
              <VarianceCalculator policy={policy} />
            </Panel>

            <Panel>
              <PanelHead
                title="Remediation pipeline"
                description="Where every exception on the register stands right now."
                count={`${board.total} ${board.total === 1 ? "exception" : "exceptions"}`}
              />
              <div className="grid gap-x-5 gap-y-4 border-t border-border/60 px-4 py-4 sm:grid-cols-3">
                {STAGES.map((stage) => (
                  <Stat
                    key={stage.key}
                    label={stage.label}
                    value={counts[stage.key as keyof typeof counts]}
                    tone={stage.tone}
                    note={stage.hint}
                  />
                ))}
              </div>
              <div className="space-y-3 border-t border-border/60 px-4 py-3">
                <div>
                  <MicroLabel>Register mix</MicroLabel>
                  <div className="mt-1.5">
                    <StackBar
                      height={10}
                      legend
                      segments={STAGES.map((stage) => ({
                        label: stage.label,
                        tone: stage.tone,
                        value: counts[stage.key as keyof typeof counts],
                      }))}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <MicroLabel>Closed and signed off</MicroLabel>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {counts.CLOSED} of {board.total}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Meter value={closedShare} tone="success" height={8} />
                  </div>
                </div>
              </div>
              <div className="border-t border-border/60 px-4 py-3">
                <Callout tone={board.overdue > 0 ? "warning" : "primary"} title="Rule in force">
                  {ruleText} {deadlineText}{" "}
                  <Link href="/fm/management-analytics/analytics-alerts" className="font-semibold underline">
                    Change policy →
                  </Link>
                </Callout>
              </div>
            </Panel>
          </div>

          <Panel>
            <PanelHead
              title="Exception register"
              description="Confirmed and recurrent breaches requiring an accountable owner position, root-cause memo, and post-fix verification readings."
              count={`${board.total} ${board.total === 1 ? "exception" : "exceptions"}`}
            />
            <VarianceFilters
              companies={board.companies}
              company={variance.filters.company}
              status={variance.filters.status}
              q={variance.filters.q}
              onCompany={(value) => variance.updateFilters({ company: value })}
              onStatus={(value) => variance.updateFilters({ status: value })}
              onSearch={(value) => variance.updateFilters({ q: value })}
              onClear={() => variance.updateFilters({ company: "ALL", status: "ALL", q: "" })}
            />

            <ExceptionTable rows={board.rows} isLoading={variance.isLoading} onOpen={variance.openDetail} />

            <Pager
              page={variance.page}
              size={variance.size}
              total={board.total}
              onPage={variance.setPage}
              onSize={variance.setSize}
            />
          </Panel>

          <Panel>
            <PanelHead
              title="Provisional breaches & forecast risk"
              description={
                policy.sustainedRule
                  ? `Watchlist KPIs over threshold awaiting confirmation (${policy.confirmPeriods} consecutive periods or ${policy.spikeMultiple}× spike), plus KPIs with ≥60% predicted breach risk. No memo required until confirmed.`
                  : "Strict single-period mandate is enabled; watchlist shows forecast breach risks ≥60%."
              }
              count={provisionalList.length}
            />
            {provisionalList.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No provisional breach or elevated forecast risk detected in this scope.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[760px] text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Company</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Confirms if</TableHead>
                      <TableHead className="pr-4 text-right">P(breach next)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {provisionalList.map((item) => (
                      <TableRow key={`${item.companyCode}-${item.kpiId}`}>
                        <TableCell className="pl-4 font-mono uppercase">{item.companyCode}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{item.kpiName}</span>
                            <ErpTags kpiKey={item.kpiKey} sourceCodes={item.sourceCodes} compact />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{item.period}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                          {item.varianceText}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={item.statusCode === "PROVISIONAL" ? "warning" : item.statusCode === "FORECAST_RISK" ? "danger" : "info"}>
                            {item.statusCode === "PROVISIONAL" ? "Provisional" : item.statusCode === "FORECAST_RISK" ? "Forecast risk" : "Watch"}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.confirmsIf}</TableCell>
                        <TableCell className="pr-4 text-right font-mono tabular-nums">
                          {item.breachProbPct !== null ? `${item.breachProbPct}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </>
      )}

      <ExceptionDetailDialog
        detail={variance.detail}
        positionsByCompany={board.positionsByCompany}
        open={variance.detail !== null}
        isSaving={variance.isSaving}
        onOpenChange={(open) => {
          if (!open) variance.setDetail(null);
        }}
        onMemo={variance.saveMemo}
        onClose={variance.close}
        onReopen={variance.reopen}
        onReading={variance.addReading}
      />
    </div>
  );
}
