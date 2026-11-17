"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ACCENT, RECONCILIATION_PAGE_SIZE, RECONCILIATION_STORAGE_KEY } from "../constants";
import { useReconciliation } from "../hooks/useReconciliation";
import { useStatements } from "../hooks/useStatements";
import { ReconciliationTable } from "./ReconciliationTable";
import { Notice } from "./Notice";
import { RollForwardPanel } from "./RollForwardPanel";
import { SignOffDialog } from "./SignOffDialog";
import { StatementsPanel } from "./StatementsPanel";
import { TablePager, pageCountFor, usePageSize } from "./TablePager";
import type { ReconciliationRow } from "../types";

/** Both tabs stay mounted so a pager or a half-typed statement survives a tab switch. */
export function ReconciliationModule() {
  const reconciliation = useReconciliation();
  const statements = useStatements();
  const [tab, setTab] = useState("roll-forward");
  const [signing, setSigning] = useState<ReconciliationRow | null>(null);
  const [pageSize, setPageSize] = usePageSize(RECONCILIATION_STORAGE_KEY, RECONCILIATION_PAGE_SIZE);
  const pageCount = pageCountFor(reconciliation.total, pageSize);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Loan Reconciliation</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Prove the loan ledger ties for a period, sign the result, and compare a lender statement against our own
            schedule and payments.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {reconciliation.context?.lockedThrough
            ? `Books closed through ${reconciliation.context.lockedThrough}`
            : "No period is closed"}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="roll-forward" className="min-h-11 md:min-h-0">
            Period roll-forward
          </TabsTrigger>
          <TabsTrigger value="statements" className="min-h-11 md:min-h-0">
            Lender statements
            {statements.total > 0 ? (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{statements.total}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roll-forward" forceMount className="mt-3 space-y-4 data-[state=inactive]:hidden">
          <RollForwardPanel
            period={reconciliation.period}
            onPeriodChange={reconciliation.setPeriod}
            rollForward={reconciliation.rollForward}
            today={reconciliation.context?.today ?? ""}
            isBuilding={reconciliation.isBuilding}
            isSaving={reconciliation.isSaving}
            onBuild={() => void reconciliation.build()}
            onSave={reconciliation.save}
          />

          <Card className={`overflow-hidden rounded-2xl border border-border/50 shadow-sm ${ACCENT.rail}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Saved periods</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {reconciliation.total === 0
                    ? "Nothing saved yet."
                    : `${reconciliation.total} period${reconciliation.total === 1 ? "" : "s"} reconciled`}
                </p>
              </div>
              <Select value={reconciliation.resultFilter} onValueChange={reconciliation.setResultFilter}>
                <SelectTrigger className="h-8 w-[150px]" aria-label="Result filter">
                  <SelectValue placeholder="All results" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="ALL">All results</SelectItem>
                  <SelectItem value="RECONCILED">Reconciled</SelectItem>
                  <SelectItem value="DIFFERENCE">Difference</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reconciliation.error ? (
              <div className="px-4 pt-3">
                <Notice tone="danger" title="The roll-forward did not come back">
                  {reconciliation.error}{" "}
                  <button type="button" className="underline" onClick={() => void reconciliation.reload()}>
                    Try again
                  </button>
                </Notice>
              </div>
            ) : null}
            {reconciliation.notice ? (
              <div className="px-4 pt-3">
                <Notice tone="info" title="Saved">
                  {reconciliation.notice}
                </Notice>
              </div>
            ) : null}

            <ReconciliationTable
              rows={reconciliation.rows}
              isLoading={reconciliation.isLoading}
              isFiltered={reconciliation.resultFilter !== "ALL"}
              onSignOff={(row) => setSigning(row)}
            />

            {reconciliation.total > 0 ? (
              <TablePager
                page={reconciliation.page}
                pageCount={pageCount}
                total={reconciliation.total}
                pageSize={pageSize}
                onPageChange={reconciliation.setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  reconciliation.setPageSize(size);
                }}
                allowAll={false}
                isLoading={reconciliation.isLoading}
                className="border-t border-border/50 px-4 py-3"
              />
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="statements" forceMount className="mt-3 data-[state=inactive]:hidden">
          <StatementsPanel
            loans={reconciliation.context?.loans ?? []}
            today={reconciliation.context?.today ?? ""}
            statements={statements}
          />
        </TabsContent>
      </Tabs>

      <SignOffDialog
        row={signing}
        open={signing !== null}
        onOpenChange={(open) => {
          if (!open) setSigning(null);
        }}
        onConfirm={(row, remarks) => reconciliation.signOff(row.id, remarks)}
      />
    </div>
  );
}
