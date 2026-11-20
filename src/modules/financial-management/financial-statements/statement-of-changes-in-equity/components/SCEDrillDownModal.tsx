"use client";

import React from "react";
import { useStatementOfChangesInEquity } from "../hooks/useStatementOfChangesInEquity";
import { formatCurrency } from "../utils/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SCEDrillDownModal() {
  const {
    selectedDrillDownAccount,
    drillDownLines,
    isDrillDownLoading,
    closeDrillDown,
  } = useStatementOfChangesInEquity();

  const isOpen = !!selectedDrillDownAccount;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDrillDown()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader>
          <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
            GL {selectedDrillDownAccount?.glCode} · EQUITY DRILL-DOWN
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">
            {selectedDrillDownAccount?.title}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Posted journal entries contributing to this line in the selected period.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4 border rounded-md">
          {isDrillDownLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Loading transactions...
            </div>
          ) : drillDownLines.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No individual entries posted to this account in the current period.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <th className="py-2.5 px-3">DATE</th>
                  <th className="py-2.5 px-3">JE NO.</th>
                  <th className="py-2.5 px-3">DESCRIPTION</th>
                  <th className="py-2.5 px-3 text-right">DEBIT</th>
                  <th className="py-2.5 px-3 text-right">CREDIT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {drillDownLines.map((line) => (
                  <tr key={line.id} className="hover:bg-muted/20">
                    <td className="py-2 px-3 text-muted-foreground">{line.date}</td>
                    <td className="py-2 px-3 font-mono font-medium text-foreground">{line.jeNo}</td>
                    <td className="py-2 px-3">{line.description}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {line.debit > 0 ? formatCurrency(line.debit) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {line.credit > 0 ? formatCurrency(line.credit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
