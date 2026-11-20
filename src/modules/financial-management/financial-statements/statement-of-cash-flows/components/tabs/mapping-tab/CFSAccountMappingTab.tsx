"use client";

import React from "react";
import { useCashFlowStudio } from "../../../providers/CashFlowStudioProvider";
import { formatPHP } from "../../../utils/cfs-format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function CFSAccountMappingTab() {
  const { data, setSimulateUnmapped } = useCashFlowStudio();
  const unmapped = data.unmappedAccounts;

  return (
    <div className="flex flex-col gap-6">
      {/* Simulation status banner */}
      {unmapped.length > 0 ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-rose-500 text-xs font-bold">
            <AlertCircle className="h-4 w-4" />
            <span>{unmapped.length} Unmapped GL Accounts Detected</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The movements of these accounts are omitted from the cash flow statement, causing it to be out of balance by ₱6,000.00. Map them to their corresponding cash flow lines or click &quot;Use suggestion&quot; to balance the report.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-2 text-emerald-600 text-xs font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          <span>All general ledger accounts are successfully mapped. The cash flow statement is in balance.</span>
        </div>
      )}

      {/* Unmapped accounts table */}
      {unmapped.length > 0 && (
        <div className="rounded-xl border bg-card p-6 shadow-sm overflow-hidden">
          <h3 className="text-sm font-bold text-foreground mb-1">Unmapped accounts</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Assign each account to join an existing cash flow line or create a new operating line.
          </p>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/80">
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[90px]">Code</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground">Account Title</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[90px]">Type</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">Opening</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">Closing</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">Movement</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[240px]">Suggested Line</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground w-[120px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmapped.map((acc) => (
                  <TableRow key={acc.accountNumber} className="border-b border-border/40 text-xs">
                    <TableCell className="font-mono font-medium py-2.5">{acc.accountNumber}</TableCell>
                    <TableCell className="font-medium py-2.5">{acc.accountTitle}</TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {acc.accountType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono py-2.5">{formatPHP(acc.openingBalance)}</TableCell>
                    <TableCell className="text-right font-mono py-2.5">{formatPHP(acc.closingBalance)}</TableCell>
                    <TableCell className="text-right font-mono py-2.5 font-bold text-rose-500">{formatPHP(acc.movement)}</TableCell>
                    <TableCell className="text-muted-foreground py-2.5 truncate max-w-[220px]">
                      {acc.suggestedLineLabel}
                    </TableCell>
                    <TableCell className="text-right py-2.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSimulateUnmapped(false)}
                        className="h-7 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        Use suggestion
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Current mapping summary */}
      <div className="rounded-xl border bg-card p-6 shadow-sm overflow-hidden">
        <h3 className="text-sm font-bold text-foreground mb-1">Current mapping</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Read-only reference of active chart-of-accounts mapping feeding the statement lines.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border bg-muted/10 p-3">
            <span className="font-bold text-foreground">Trade Receivables</span>
            <p className="text-muted-foreground mt-0.5">GL: 1200 Accounts Receivable Trade, 1210 Allowance for Impairment</p>
          </div>
          <div className="rounded-lg border bg-muted/10 p-3">
            <span className="font-bold text-foreground">Inventories</span>
            <p className="text-muted-foreground mt-0.5">GL: 1300 Merchandise Inventory, 1350 Goods in Transit</p>
          </div>
          <div className="rounded-lg border bg-muted/10 p-3">
            <span className="font-bold text-foreground">Trade Payables</span>
            <p className="text-muted-foreground mt-0.5">GL: 2000 Accounts Payable Trade, 2010 Accrued Purchases</p>
          </div>
          <div className="rounded-lg border bg-muted/10 p-3">
            <span className="font-bold text-foreground">Cash on Hand and in Banks</span>
            <p className="text-muted-foreground mt-0.5">GL: 1010 Petty Cash, 1020 Cash in Bank BDO, 1030 Cash in Bank BPI</p>
          </div>
        </div>
      </div>
    </div>
  );
}
