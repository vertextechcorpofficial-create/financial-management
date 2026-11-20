"use client";

import { ScanSearch } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExceptionDetailDialog } from "./ExceptionDetailDialog";
import { ExceptionTable } from "./ExceptionTable";
import { Pager } from "./Pager";
import { VarianceFilters } from "./VarianceFilters";

import { ACCENT, EXCEPTION_PAGE_SIZE, toneClass } from "../constants";
import { useVariance } from "../hooks/useVariance";
import { phtToday } from "../pht";

const TILES = [
  { key: "open", label: "Still open", tone: "warning" as const, hint: "Exceptions with no memo filed yet" },
  { key: "monitoring", label: "Monitoring", tone: "info" as const, hint: "Memo filed, waiting on the next readings" },
  { key: "escalated", label: "Escalated", tone: "danger" as const, hint: "Past the memo deadline" },
  { key: "closed", label: "Closed", tone: "success" as const, hint: "Back inside tolerance and signed off" },
];

export function VarianceModule() {
  const variance = useVariance(EXCEPTION_PAGE_SIZE);
  const { board } = variance;
  const period = phtToday().slice(0, 7);

  const counts = {
    open: board.counts.OPEN ?? 0,
    monitoring: board.counts.MONITORING ?? 0,
    escalated: board.counts.ESCALATED ?? 0,
    closed: board.counts.CLOSED ?? 0,
  };

  const handleScan = async () => {
    try {
      const result = await variance.runScan(period);
      toast.success(
        result.created === 0
          ? `${result.period}: nothing new — ${result.skipped} ${result.skipped === 1 ? "exception" : "exceptions"} already on the board.`
          : `${result.period}: ${result.created} exception${result.created === 1 ? "" : "s"} recorded.`,
      );
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The scan could not be completed.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Variance Protocol</h1>
          <p className="text-sm text-muted-foreground">
            Every reading that leaves its limit by more than the policy allows, with the memo and the close that follow.
          </p>
        </div>
        <Button className="min-h-11 gap-2 md:min-h-0" onClick={handleScan} disabled={variance.isScanning}>
          <ScanSearch className="h-4 w-4" />
          {variance.isScanning ? "Scanning…" : `Scan ${period}`}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map((tile) => (
          <Card key={tile.key} className="rounded-lg border border-border/60 bg-card px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{counts[tile.key as keyof typeof counts]}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p>
          </Card>
        ))}
      </div>

      {variance.error ? (
        <Card className={`px-4 py-3 text-sm ${toneClass("danger")}`}>{variance.error}</Card>
      ) : null}

      <Card className={`overflow-hidden p-0 ${ACCENT.rail}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <div>
            <h2 className="text-sm font-semibold">Exception register</h2>
            <p className="text-xs text-muted-foreground">
              {board.overdue} past its memo deadline · {board.open} still open
            </p>
          </div>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {board.total} {board.total === 1 ? "exception" : "exceptions"}
          </span>
        </div>

        <div className="mt-3">
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
        </div>

        <ExceptionTable rows={board.rows} isLoading={variance.isLoading} onOpen={variance.openDetail} />

        <Pager
          page={variance.page}
          size={variance.size}
          total={board.total}
          onPage={variance.setPage}
          onSize={variance.setSize}
        />
      </Card>

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
