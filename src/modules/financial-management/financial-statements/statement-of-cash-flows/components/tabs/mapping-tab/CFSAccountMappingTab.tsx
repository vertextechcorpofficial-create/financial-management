"use client";

import React, { useState, useEffect } from "react";
import { useCashFlowStudio } from "../../../providers/CashFlowStudioProvider";
import { formatPHP } from "../../../utils/cfs-format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, CheckCircle2, FileQuestion, Scale, HelpCircle } from "lucide-react";
import { getLiveCashFlowEntries } from "../../../services/cash-flow-direct.service";
import { CFSEntryItem } from "../../../types";

export function CFSAccountMappingTab() {
  const { data, filters } = useCashFlowStudio();
  const unmapped = data.unmappedAccounts;
  const [unclassifiedEntries, setUnclassifiedEntries] = useState<CFSEntryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (unmapped.length === 0) {
      return;
    }

    const controller = new AbortController();

    getLiveCashFlowEntries({
      startDate: filters.startDate,
      endDate: filters.endDate,
      activity: "UNCLASSIFIED",
      size: 50,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setUnclassifiedEntries(res.items || []);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setUnclassifiedEntries([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [filters.startDate, filters.endDate, unmapped.length]);

  // Aggregate document references per unclassified category
  const exceptions = React.useMemo(() => {
    return unmapped.map((item) => {
      const isMissingAccount = item.accountTitle.toLowerCase().includes("no account");
      const isImbalanced = item.accountTitle.toLowerCase().includes("unbalanced");

      // Find matching vouchers from entries
      const matchingVouchers = unclassifiedEntries.filter((v) => {
        if (isMissingAccount) {
          return !v.glCode || v.accountTitle.toLowerCase().includes("no account");
        }
        if (isImbalanced) {
          return v.accountTitle.toLowerCase().includes("unbalanced") || v.glCode === null;
        }
        return v.glCode === item.accountNumber || v.accountTitle === item.accountTitle;
      });

      // Collect unique reference document numbers and modules
      const refs = Array.from(
        new Set(matchingVouchers.map((v) => v.transactionRef || v.jeNo).filter(Boolean))
      );
      const modules = Array.from(
        new Set(matchingVouchers.map((v) => v.sourceModule).filter(Boolean))
      );

      let issueType = "Unmapped COA Tag";
      let remediation = "Open Chart of Accounts and assign an Operating, Investing, or Financing tag to this account.";

      if (isMissingAccount) {
        issueType = "Missing GL Account Line";
        remediation = refs.length > 0
          ? `Open voucher(s) ${refs.join(", ")} in ${modules.join(" / ") || "Disbursement"} and select a valid expense/payable GL account for the undefined line.`
          : "Edit the affected disbursement or journal voucher and assign a valid GL account to the line.";
      } else if (isImbalanced) {
        issueType = "Imbalanced Voucher (Debit ≠ Credit)";
        remediation = refs.length > 0
          ? `Review voucher(s) ${refs.join(", ")} in ${modules.join(" / ") || "Disbursement"}. Rebalance the debit and credit lines so total debits equal total credits before posting.`
          : "Review the unbalanced journal entries and adjust debit or credit amounts so the entry totals balance.";
      }

      return {
        ...item,
        issueType,
        isMissingAccount,
        isImbalanced,
        references: refs.length > 0 ? refs : ["Pending ledger review"],
        modules: modules.length > 0 ? modules : ["General Ledger"],
        remediation,
      };
    });
  }, [unmapped, unclassifiedEntries]);

  return (
    <div className="flex flex-col gap-6">
      {/* Simulation status banner */}
      {unmapped.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold">
            <AlertCircle className="h-4 w-4" />
            <span>{unmapped.length} Ledger Exception{unmapped.length > 1 ? "s" : ""} Identified</span>
          </div>
          <p className="text-xs text-muted-foreground">
            The transactions below created cash movements that lack proper account attribution or balance in the general ledger. Review the reference documents and apply the recommended solutions to resolve the variances.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-2 text-emerald-600 text-xs font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          <span>All general ledger entries are fully classified and balanced. The Statement of Cash Flows reconciles with zero variance.</span>
        </div>
      )}

      {/* Ledger Exceptions Table */}
      {exceptions.length > 0 && (
        <div className="rounded-xl border bg-card p-6 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-foreground">Ledger Exceptions & Remediation Actions</h3>
            {isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">
                Fetching document references...
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Specific source transactions causing unclassified cash variances, with direct instructions on how to correct them.
          </p>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/80 bg-muted/20">
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[180px]">Issue Type</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[200px]">Description</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[160px]">Reference Document(s)</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[130px]">Source Module</TableHead>
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground w-[110px]">Variance (₱)</TableHead>
                  <TableHead className="text-left text-xs font-bold uppercase text-muted-foreground">Possible Solution & Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map((exc, idx) => (
                  <TableRow key={`${exc.accountNumber}-${idx}`} className="border-b border-border/40 text-xs hover:bg-muted/10 transition-colors">
                    {/* ISSUE TYPE BADGE */}
                    <TableCell className="py-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        {exc.isMissingAccount ? (
                          <FileQuestion className="h-4 w-4 text-rose-500 shrink-0" />
                        ) : exc.isImbalanced ? (
                          <Scale className="h-4 w-4 text-amber-500 shrink-0" />
                        ) : (
                          <HelpCircle className="h-4 w-4 text-blue-500 shrink-0" />
                        )}
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold uppercase ${
                            exc.isMissingAccount
                              ? "border-rose-500/30 text-rose-600 bg-rose-500/10"
                              : exc.isImbalanced
                              ? "border-amber-500/30 text-amber-600 bg-amber-500/10"
                              : "border-blue-500/30 text-blue-600 bg-blue-500/10"
                          }`}
                        >
                          {exc.issueType}
                        </Badge>
                      </div>
                    </TableCell>

                    {/* DESCRIPTION */}
                    <TableCell className="py-3 font-semibold text-foreground">
                      {exc.accountTitle}
                    </TableCell>

                    {/* REFERENCE DOCUMENTS */}
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {exc.references.map((ref) => (
                          <span
                            key={ref}
                            className="font-mono text-[11px] font-bold bg-muted px-2 py-0.5 rounded border border-border text-foreground"
                          >
                            {ref}
                          </span>
                        ))}
                      </div>
                    </TableCell>

                    {/* SOURCE MODULE */}
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {exc.modules.map((mod) => (
                          <Badge key={mod} variant="secondary" className="text-[10px]">
                            {mod}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    {/* VARIANCE AMOUNT */}
                    <TableCell className="text-right font-mono py-3 font-bold text-rose-500 tabular-nums">
                      {formatPHP(exc.movement)}
                    </TableCell>

                    {/* POSSIBLE SOLUTION & ACTION */}
                    <TableCell className="py-3 text-muted-foreground leading-relaxed">
                      {exc.remediation}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Current mapping reference */}
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
