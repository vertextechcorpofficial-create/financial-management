"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { PERIOD_PARAM, isPeriod } from "@/modules/financial-management/management-analytics/shared/analytics-screens";
import { Meter, StackBar, type Tone } from "@/modules/financial-management/management-analytics/shared/Charts";
import { BoardHeader, Callout, MicroLabel, Panel, PanelHead, Stat } from "@/modules/financial-management/management-analytics/shared/BoardKit";

import { ExceptionDetailDialog } from "./ExceptionDetailDialog";
import { ExceptionTable } from "./ExceptionTable";
import { Pager } from "./Pager";
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
  { key: "CLOSED", label: "Closed", tone: "success" as Tone, hint: "Back inside tolerance and signed off" },
];

export function VarianceModule() {
  const variance = useVariance(EXCEPTION_PAGE_SIZE);
  const searchParams = useSearchParams();
  const requestedPeriod = searchParams.get(PERIOD_PARAM);
  const { board } = variance;
  const period = isPeriod(requestedPeriod) ? requestedPeriod : phtToday().slice(0, 7);
  const { policy } = board;
  // A read that never succeeded has nothing to draw: the empty board below would read as a clean
  // month with zero exceptions, which is the one thing a failed read must never say.
  const failedRead = Boolean(variance.error) && !variance.hasRead;

  const counts = {
    OPEN: board.counts.OPEN ?? 0,
    MONITORING: board.counts.MONITORING ?? 0,
    ESCALATED: board.counts.ESCALATED ?? 0,
    RECURRENCE: board.counts.RECURRENCE ?? 0,
    CLOSED: board.counts.CLOSED ?? 0,
  };
  const closedShare = board.total > 0 ? (counts.CLOSED / board.total) * 100 : 0;

  const ruleText = policy.sustainedRule
    ? `A percentage reading confirms after ${policy.confirmPeriods} ${
        policy.confirmPeriods === 1 ? "period" : "periods"
      } in a row over the threshold, or at once when it reaches ${policy.spikeMultiple} times that threshold.`
    : "Any single period over the threshold confirms a breach.";
  const deadlineText = `Memos are due ${policy.memoDeadlineDays} business days after the period ends. Absolute limits such as safety, uptime, churn, floors and ceilings confirm on the first period.`;

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

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Variance Protocol"
        subtitle="Each breach needs a root-cause memo and an accountable owner, chosen by position, by the deadline. Missing memos escalate to the company General Manager, then to the Group Executive Committee. A breach closes only after the KPI stays within tolerance for the required number of periods after the fix."
        meta={
          failedRead ? undefined : (
            <>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                As of {board.asOf || "today"}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                {board.open} {board.open === 1 ? "exception open" : "exceptions open"}
              </span>
              {/* The header row cannot shrink below its content, so the long sentences are cut at the
                  narrowest widths rather than clipped by the page edge: the count always leads. */}
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
                <span className="min-[520px]:hidden">{board.overdue} overdue</span>
                <span className="hidden min-[520px]:inline">{board.overdue} past the memo deadline</span>
              </span>
            </>
          )
        }
        right={
          <Button className="min-h-11 gap-2 md:min-h-0" onClick={handleScan} disabled={variance.isScanning}>
            <ScanSearch className="h-4 w-4" />
            {variance.isScanning ? "Scanning…" : `Scan ${period}`}
          </Button>
        }
      />

      {variance.error ? (
        <Callout tone="danger" title="The board could not be read">
          {variance.error}
          {failedRead
            ? " Nothing is drawn from that read, because an empty register and a clean month look the same. Refresh to try again, or check that the analytics API is answering."
            : " Every figure below was read before that failure, so a recent change may be missing."}
        </Callout>
      ) : null}

      {failedRead ? null : (
        <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead
            title="Variance calculator"
            description="Run one reading against its target under the rule in force, before you commit a target to a KPI."
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
          <div className="grid gap-x-5 gap-y-4 border-t border-border/60 px-4 py-4 sm:grid-cols-2">
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
          description="Open a row to read its run, file the memo or close it. Provisional and favorable readings enter this register as open rows, because both still owe a memo."
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
          title="Provisional breaches — monitoring"
          description={
            policy.sustainedRule
              ? `KPIs over threshold but not yet confirmed by the sustained-breach rule (${policy.confirmPeriods} consecutive periods or ${policy.spikeMultiple}× spike).`
              : "Strict single-period mandate is enabled, so every breach confirms immediately."
          }
          count={board.rows.filter((r) => /provisional/i.test(r.reason ?? "")).length}
        />
        {board.rows.filter((r) => /provisional/i.test(r.reason ?? "")).length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {policy.sustainedRule
              ? "No provisional breaches currently awaiting confirmation in this view."
              : "Strict mandate is on — all breaches confirm on the first period."}
          </p>
        ) : (
          <div className="divide-y divide-border/50 px-4">
            {board.rows
              .filter((r) => /provisional/i.test(r.reason ?? ""))
              .map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => void variance.openDetail(row.id)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {row.companyCode} · {row.kpiName}
                    </p>
                    <p className="truncate text-muted-foreground">{row.reason}</p>
                  </div>
                  <span className="shrink-0 font-mono tabular-nums text-warning">
                    {row.relative_pct > 0 ? "+" : ""}
                    {row.relative_pct.toFixed(1)}%
                  </span>
                </button>
              ))}
          </div>
        )}
      </Panel>
        </>
      )}

      <ExceptionDetailDialog
        detail={variance.detail}
        open={variance.detail !== null}
        isSaving={variance.isSaving}
        onOpenChange={(open) => {
          if (!open) variance.setDetail(null);
        }}
        onMemo={variance.saveMemo}
        onClose={variance.close}
        onReading={variance.addReading}
      />
    </div>
  );
}
