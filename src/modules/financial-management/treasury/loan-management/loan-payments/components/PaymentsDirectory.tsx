"use client";

import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

import { ACCENT } from "../constants";
import { useLoanDirectory } from "../hooks/useLoanDirectory";
import { DirectoryFilters } from "./DirectoryFilters";
import { DirectoryTable } from "./DirectoryTable";
import { Notice } from "./Notice";
import { TablePager, pageCountFor } from "./TablePager";

/** Level 1: the loan directory. Every row opens that loan's payment workspace. */
export function PaymentsDirectory({ onOpenLoan }: { onOpenLoan: (loanId: number) => void }) {
  const directory = useLoanDirectory();
  const isFiltered =
    directory.filters.q.trim().length > 0 ||
    directory.filters.status !== "ALL" ||
    directory.filters.lenderType !== "ALL" ||
    directory.filters.method !== "ALL";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Pay installments and see what&apos;s due, overdue and paid. Choose a loan to open it.
        </p>
      </div>

      {directory.error ? (
        <Notice tone="danger" title="The loans could not be read.">
          {directory.error}
        </Notice>
      ) : null}

      <Card className={`border-t-[3px] ${ACCENT.rail}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Loans</h3>
            <p className="text-xs text-muted-foreground">
              Each row is a loan; the amount due now is what its installments owe today, penalties included.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
            {isFiltered
              ? `${formatNumber(directory.total)} matching`
              : `${formatNumber(directory.total)} ${directory.total === 1 ? "loan" : "loans"}`}
          </span>
        </div>

        <DirectoryFilters filters={directory.filters} onChange={directory.updateFilters} onClear={directory.clearFilters} />

        <DirectoryTable
          rows={directory.rows}
          isLoading={directory.isLoading}
          isFiltered={isFiltered}
          onOpen={(row) => onOpenLoan(row.id)}
        />

        <TablePager
          page={directory.page}
          pageCount={pageCountFor(directory.total, directory.pageSize)}
          total={directory.total}
          pageSize={directory.pageSize}
          onPageChange={directory.setPage}
          onPageSizeChange={directory.setPageSize}
          allowAll={false}
          isLoading={directory.isLoading}
          className="border-t border-border/50 px-4 py-3"
        />
      </Card>
    </div>
  );
}

export default PaymentsDirectory;
