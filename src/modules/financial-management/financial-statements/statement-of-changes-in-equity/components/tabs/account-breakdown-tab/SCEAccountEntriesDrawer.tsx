"use client";

import React, { useMemo } from "react";
import { useStatementOfChangesInEquity } from "../../../hooks/useStatementOfChangesInEquity";
import { formatCurrency } from "../../../utils/format";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function SCEAccountEntriesDrawer() {
  const {
    selectedDrillDownAccount,
    drillDownLines,
    isDrillDownLoading,
    closeDrillDown,
    filters,
    data,
  } = useStatementOfChangesInEquity();

  const isOpen = !!selectedDrillDownAccount;
  const glCode = selectedDrillDownAccount?.glCode || "";

  // Lookup the account from the report summary
  const accountInfo = useMemo(() => {
    return data?.accounts.find((a) => a.glCode === glCode);
  }, [data, glCode]);

  const beginningBalance = accountInfo?.beginningBalance || 0;
  const netMovement = accountInfo?.netMovement || 0;
  const endingBalance = accountInfo?.endingBalance || 0;

  // Compute Running Balance for each line
  const linesWithBalance = useMemo(() => {
    let running = beginningBalance;
    const computed = [];
    for (const line of drillDownLines) {
      const net = (line.credit || 0) - (line.debit || 0);
      running += net;
      computed.push({
        ...line,
        runningBalance: running,
      });
    }
    return computed;
  }, [drillDownLines, beginningBalance]);

  const totalDebit = drillDownLines.reduce((acc, l) => acc + (l.debit || 0), 0);
  const totalCredit = drillDownLines.reduce((acc, l) => acc + (l.credit || 0), 0);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDrillDown()}>
      <SheetContent
        side="right"
        className="w-full sm:!max-w-2xl md:!max-w-3xl flex flex-col p-6 sm:p-8 overflow-y-auto"
      >
        <SheetHeader className="border-b pb-4 text-left">
          <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
            GL {glCode} · {accountInfo?.category || "EQUITY"}
          </div>
          <SheetTitle className="text-xl font-bold text-foreground">
            {selectedDrillDownAccount?.title}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Posted journal entries ({filters.periodLabel}: {filters.startDate} – {filters.endDate})
          </p>
        </SheetHeader>

        {/* 3 Metric Summary Boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase">
              BEGINNING
            </div>
            <div className="text-sm sm:text-base font-bold font-mono text-foreground mt-1">
              {formatCurrency(beginningBalance)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase">
              NET MOVEMENT
            </div>
            <div className="text-sm sm:text-base font-bold font-mono text-foreground mt-1">
              {formatCurrency(netMovement)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase">
              ENDING
            </div>
            <div className="text-sm sm:text-base font-bold font-mono text-foreground mt-1">
              {formatCurrency(endingBalance)}
            </div>
          </div>
        </div>

        {/* Running Balance Journal Table */}
        <div className="flex-1 overflow-x-auto border rounded-lg">
          {isDrillDownLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Loading entries...
            </div>
          ) : (
            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <th className="py-2.5 px-3">DATE</th>
                  <th className="py-2.5 px-3">JE NO.</th>
                  <th className="py-2.5 px-3">DESCRIPTION</th>
                  <th className="py-2.5 px-3 text-right">DEBIT</th>
                  <th className="py-2.5 px-3 text-right">CREDIT</th>
                  <th className="py-2.5 px-3 text-right">BALANCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {/* Row 1: Beginning Balance */}
                <tr className="bg-muted/10 font-sans">
                  <td className="py-2 px-3 text-muted-foreground">{filters.startDate}</td>
                  <td className="py-2 px-3 text-muted-foreground">—</td>
                  <td className="py-2 px-3 font-medium text-foreground">Beginning balance</td>
                  <td className="py-2 px-3 text-right text-muted-foreground">—</td>
                  <td className="py-2 px-3 text-right text-muted-foreground">—</td>
                  <td className="py-2 px-3 text-right font-mono font-medium text-foreground">
                    {formatCurrency(beginningBalance)}
                  </td>
                </tr>

                {/* In-period transaction rows */}
                {linesWithBalance.map((line) => (
                  <tr key={line.id} className="hover:bg-muted/20">
                    <td className="py-2 px-3 text-muted-foreground">{line.date}</td>
                    <td className="py-2 px-3 font-medium text-foreground">{line.jeNo}</td>
                    <td className="py-2 px-3 font-sans text-foreground">{line.description}</td>
                    <td className="py-2 px-3 text-right">
                      {line.debit > 0 ? formatCurrency(line.debit) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {line.credit > 0 ? formatCurrency(line.credit) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-foreground">
                      {formatCurrency(line.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {/* Final Row: Total Activity / Ending */}
                <tr className="border-t-2 font-bold bg-muted/30 font-sans">
                  <td className="py-2.5 px-3 text-muted-foreground">{filters.endDate}</td>
                  <td className="py-2.5 px-3" colSpan={2}>
                    Total activity / ending
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {totalDebit > 0 ? formatCurrency(totalDebit) : "₱0.00"}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {totalCredit > 0 ? formatCurrency(totalCredit) : "₱0.00"}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-foreground">
                    {formatCurrency(endingBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
