"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

import { ACCENT, STATEMENT_PAGE_SIZE, STATEMENT_STORAGE_KEY } from "../constants";
import type { useStatements } from "../hooks/useStatements";
import type { LoanOption } from "../types";
import { Notice } from "./Notice";
import { RecordStatementDialog } from "./RecordStatementDialog";
import { StatementsTable } from "./StatementsTable";
import { TablePager, pageCountFor, usePageSize } from "./TablePager";

type Props = {
  loans: LoanOption[];
  today: string;
  statements: ReturnType<typeof useStatements>;
};

const RESULT_OPTIONS = [
  { value: "ALL", label: "All results" },
  { value: "AGREES", label: "Agrees" },
  { value: "DIFFERS", label: "Differs" },
];

/** Lender statements: the record band, the comparison table and one pager. */
export function StatementsPanel({ loans, today, statements }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pageSize, setPageSize] = usePageSize(STATEMENT_STORAGE_KEY, STATEMENT_PAGE_SIZE);
  const pageCount = pageCountFor(statements.total, pageSize);
  // Net, not gross: absolute values would hide two statements that disagree in opposite directions.
  const principalVariance = statements.rows.reduce(
    (sum, row) => sum + (row.lenderPrincipal - row.ourPrincipal),
    0,
  );

  return (
    <Card className={`overflow-hidden rounded-2xl border border-border/50 shadow-sm ${ACCENT.rail}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Lender statements</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {statements.total === 0
              ? "No statement recorded yet."
              : `${statements.total} statement${statements.total === 1 ? "" : "s"} on file · ${formatCurrency(
                  principalVariance,
                )} net principal variance on this page`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statements.resultFilter} onValueChange={statements.setResultFilter}>
            <SelectTrigger className="h-8 w-[150px]" aria-label="Result filter">
              <SelectValue placeholder="All results" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {RESULT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" className="h-8" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            Record statement
          </Button>
        </div>
      </div>

      {statements.error ? (
        <div className="px-4 pt-3">
          <Notice tone="danger" title="The statements could not be read">
            {statements.error}{" "}
            <button type="button" className="underline" onClick={() => void statements.reload()}>
              Try again
            </button>
          </Notice>
        </div>
      ) : null}
      {statements.notice ? (
        <div className="px-4 pt-3">
          <Notice tone="info" title="Statement recorded">
            {statements.notice}
          </Notice>
        </div>
      ) : null}

      <StatementsTable
        rows={statements.rows}
        isLoading={statements.isLoading}
        isFiltered={statements.resultFilter !== "ALL"}
      />

      {statements.total > 0 ? (
        <TablePager
          page={statements.page}
          pageCount={pageCount}
          total={statements.total}
          pageSize={pageSize}
          onPageChange={statements.setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            statements.setPageSize(size);
          }}
          allowAll={false}
          isLoading={statements.isLoading}
          className="border-t border-border"
        />
      ) : null}

      <RecordStatementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        loans={loans}
        today={today}
        isSaving={statements.isSaving}
        onSubmit={async (input) => {
          const recorded = await statements.record(input);
          return recorded ? { variances: recorded.variances } : null;
        }}
      />
    </Card>
  );
}
