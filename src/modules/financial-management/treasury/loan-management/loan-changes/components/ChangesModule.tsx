"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";

import { ACCENT } from "../constants";
import { useChanges } from "../hooks/useChanges";
import { ChangeDetailDialog } from "./ChangeDetailDialog";
import { ChangesFilters } from "./ChangesFilters";
import { ChangesTable } from "./ChangesTable";
import { Notice } from "./Notice";
import { RecordChangeDialog } from "./RecordChangeDialog";
import { TablePager, pageCountFor } from "./TablePager";

export function ChangesModule() {
  const changes = useChanges();
  const [isRecordOpen, setRecordOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const isFiltered =
    changes.filters.q.trim().length > 0 ||
    changes.filters.kind !== "ALL" ||
    changes.filters.loanId !== null ||
    changes.filters.from !== null ||
    changes.filters.to !== null;

  const detail = detailId === null ? null : (changes.rows.find((row) => row.id === detailId) ?? null);
  const pageCount = pageCountFor(changes.total, changes.pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Prepayments and Changes</h1>
          <p className="text-sm text-muted-foreground">
            Every prepayment, rate change, restructure and payoff, with the schedule version and entry each one produced.
          </p>
        </div>
        <Button
          type="button"
          className="min-h-11 shrink-0 md:min-h-0"
          onClick={() => {
            if (changes.loans.length === 0) {
              toast.error("No open loan can be changed right now.");
              return;
            }
            setRecordOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Record change
        </Button>
      </div>

      {changes.error ? (
        <Notice tone="danger" title="The changes could not be read.">
          {changes.error}
        </Notice>
      ) : null}

      <Card className={`border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Changes</h2>
            <p className="text-xs text-muted-foreground">
              {changes.error
                ? "The totals are unavailable while the table cannot be read."
                : changes.isLoading
                  ? "Reading the changes…"
                  : `Posted ${formatNumber(changes.summary.posted)} · reversed ${formatNumber(
                      changes.summary.reversed,
                    )} · prepaid ${formatCurrency(changes.summary.prepaymentsTotal)} · ${formatNumber(
                      changes.summary.payoffsTotal,
                    )} payoff${changes.summary.payoffsTotal === 1 ? "" : "s"} · gain or loss ${formatCurrency(
                      changes.summary.gainLossTotal,
                    )}`}
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
            {changes.isLoading || changes.error
              ? "—"
              : isFiltered
                ? `${formatNumber(changes.total)} matching`
                : `${formatNumber(changes.total)} change${changes.total === 1 ? "" : "s"}`}
          </span>
        </div>

        <ChangesFilters
          filters={changes.filters}
          loans={changes.loans}
          onChange={changes.updateFilters}
          onClear={changes.clearFilters}
        />

        <ChangesTable
          rows={changes.rows}
          isLoading={changes.isLoading}
          isFiltered={isFiltered}
          onOpen={(row) => setDetailId(row.id)}
        />

        <TablePager
          page={changes.page}
          pageCount={pageCount}
          total={changes.total}
          pageSize={changes.pageSize}
          onPageChange={changes.setPage}
          onPageSizeChange={changes.setPageSize}
          allowAll={false}
          isLoading={changes.isLoading}
          className="border-t border-border/50 px-4 py-3"
        />
      </Card>

      <RecordChangeDialog
        open={isRecordOpen}
        onOpenChange={setRecordOpen}
        loans={changes.loans}
        onRecorded={() => void changes.reload()}
      />

      <ChangeDetailDialog
        change={detail}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onChanged={() => changes.reload()}
      />
    </div>
  );
}

export default ChangesModule;
