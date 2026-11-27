"use client";

import React, { useState, useMemo } from "react";
import { useStatementOfChangesInEquity } from "../../../hooks/useStatementOfChangesInEquity";
import { formatCurrency } from "../../../utils/format";
import { CellDrillDownAccountBreakout } from "../../../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export function SCERollforwardCellModal() {
  const { cellDrillDown, closeCellDrillDown } = useStatementOfChangesInEquity();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const isOpen = !!cellDrillDown;

  const rawAccounts = useMemo(() => {
    return cellDrillDown?.contributingAccounts || [];
  }, [cellDrillDown]);

  // Reset search and pagination when a new cell is opened
  React.useEffect(() => {
    setSearchTerm("");
    setCurrentPage(1);
  }, [cellDrillDown]);

  // Filter accounts by search term
  const filteredAccounts = useMemo(() => {
    if (!searchTerm.trim()) return rawAccounts;
    const term = searchTerm.toLowerCase();
    return rawAccounts.filter(
      (acc) =>
        acc.glCode.toLowerCase().includes(term) ||
        acc.accountTitle.toLowerCase().includes(term) ||
        acc.category.toLowerCase().includes(term)
    );
  }, [rawAccounts, searchTerm]);

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, currentPage, pageSize]);

  if (!cellDrillDown) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeCellDrillDown()}>
      <DialogContent className="w-full sm:max-w-2xl md:max-w-3xl p-6 sm:p-8">
        <DialogHeader className="border-b pb-4 text-left">
          <div className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
            {cellDrillDown.columnTitle} · Equity Breakdown
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            {cellDrillDown.rowLabel}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Contributing General Ledger accounts {cellDrillDown.periodLabel ? `for ${cellDrillDown.periodLabel}` : ""}
          </p>
        </DialogHeader>

        {/* Top Summary Banner */}
        <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 my-1">
          <div className="text-xs font-semibold uppercase text-muted-foreground">
            Total Statement Amount
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-foreground">
            {formatCurrency(cellDrillDown.totalAmount)}
          </div>
        </div>

        {/* Search Bar & Total Count */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by GL code or title..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {filteredAccounts.length === 0
                ? "0"
                : `${(currentPage - 1) * pageSize + 1}–${Math.min(
                    currentPage * pageSize,
                    filteredAccounts.length
                  )}`}
            </span>{" "}
            of <span className="font-medium text-foreground">{rawAccounts.length}</span> accounts
          </div>
        </div>

        {/* Breakdown of contributing accounts table */}
        <div className="mt-2 flex flex-col gap-2">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <th className="py-2.5 px-3 w-24">GL CODE</th>
                  <th className="py-2.5 px-3">ACCOUNT TITLE</th>
                  <th className="py-2.5 px-3 text-right w-36">AMOUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground italic">
                      {searchTerm ? "No matching accounts found." : "No individual sub-account entries posted."}
                    </td>
                  </tr>
                ) : (
                  paginatedAccounts.map((acc: CellDrillDownAccountBreakout) => (
                    <tr key={acc.glCode} className="hover:bg-muted/15 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-semibold text-foreground">
                        {acc.glCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground">{acc.accountTitle}</div>
                        <div className="text-[10px] text-muted-foreground">{acc.category}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-foreground">
                        {formatCurrency(acc.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold bg-muted/30">
                  <td colSpan={2} className="py-2.5 px-3">
                    Sum of contributing accounts
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-foreground">
                    {formatCurrency(
                      rawAccounts.reduce((sum: number, item: CellDrillDownAccountBreakout) => sum + item.amount, 0)
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page <span className="font-medium text-foreground">{currentPage}</span> of{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
