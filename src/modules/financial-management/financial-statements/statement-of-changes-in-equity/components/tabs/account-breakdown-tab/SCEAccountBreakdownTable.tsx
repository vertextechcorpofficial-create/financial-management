"use client";

import React, { useState, useMemo } from "react";
import { useStatementOfChangesInEquity } from "../../../hooks/useStatementOfChangesInEquity";
import { formatCurrency, formatPercent } from "../../../utils/format";
import { SCEAccountBreakdownItem } from "../../../types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown, Loader2 } from "lucide-react";

export function SCEAccountBreakdownTable() {
  const { data, openDrillDown, filters, isLoading } = useStatementOfChangesInEquity();
  const accounts = useMemo(() => data?.accounts || [], [data?.accounts]);
  const hasComparison = !!filters.compare && !!data?.hasComparison;
  const comparisonLabel = data?.comparisonLabel || "Comparison";

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"glCode" | "title" | "ending">("glCode");
  const [sortAsc, setSortAsc] = useState(true);

  const filteredAccounts = useMemo(() => {
    return accounts
      .filter(
        (a: SCEAccountBreakdownItem) =>
          a.accountTitle.toLowerCase().includes(search.toLowerCase()) ||
          a.glCode.includes(search) ||
          a.category.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a: SCEAccountBreakdownItem, b: SCEAccountBreakdownItem) => {
        if (sortField === "glCode") {
          return sortAsc ? a.glCode.localeCompare(b.glCode) : b.glCode.localeCompare(a.glCode);
        }
        if (sortField === "title") {
          return sortAsc
            ? a.accountTitle.localeCompare(b.accountTitle)
            : b.accountTitle.localeCompare(a.accountTitle);
        }
        return sortAsc
          ? a.endingBalance - b.endingBalance
          : b.endingBalance - a.endingBalance;
      });
  }, [accounts, search, sortField, sortAsc]);

  const toggleSort = (field: "glCode" | "title" | "ending") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const totalBeg = accounts.reduce((acc: number, a: SCEAccountBreakdownItem) => acc + a.beginningBalance, 0);
  const totalMov = accounts.reduce((acc: number, a: SCEAccountBreakdownItem) => acc + a.netMovement, 0);
  const totalEnd = accounts.reduce((acc: number, a: SCEAccountBreakdownItem) => acc + a.endingBalance, 0);
  const totalCompEnd = accounts.reduce((acc: number, a: SCEAccountBreakdownItem) => acc + (a.comparisonBalance ?? 0), 0);
  const totalCompChange = accounts.reduce((acc: number, a: SCEAccountBreakdownItem) => acc + (a.comparisonChange ?? 0), 0);

  return (
    <div className="relative flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm sm:p-4">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-30 rounded-lg">
          <div className="flex items-center gap-2 bg-card border shadow-lg px-4 py-2 rounded-lg text-xs font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Recalculating account breakdown...</span>
          </div>
        </div>
      )}

      {/* Search & Counter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Find an account (Search account title or GL code)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {hasComparison && (
            <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 font-medium border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300">
              Comparing with {comparisonLabel}
            </span>
          )}
          <span>
            <span className="font-semibold text-foreground">{filteredAccounts.length}</span> matching accounts ·{" "}
            <span className="font-semibold text-foreground">{accounts.length}</span> in the applied report
          </span>
        </div>
      </div>

      {/* Account Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th
                className="py-3 px-3 font-semibold text-muted-foreground cursor-pointer uppercase tracking-wider"
                onClick={() => toggleSort("title")}
              >
                <div className="flex items-center gap-1">
                  ACCOUNT <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
              <th
                className="py-3 px-3 font-semibold text-muted-foreground cursor-pointer uppercase tracking-wider w-24"
                onClick={() => toggleSort("glCode")}
              >
                <div className="flex items-center gap-1">
                  GL CODE <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
              <th className="py-3 px-3 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                BEGINNING BALANCE
              </th>
              <th className="py-3 px-3 text-right font-semibold text-muted-foreground uppercase tracking-wider">
                NET MOVEMENT
              </th>
              <th
                className="py-3 px-3 text-right font-semibold text-muted-foreground cursor-pointer uppercase tracking-wider"
                onClick={() => toggleSort("ending")}
              >
                <div className="flex items-center justify-end gap-1">
                  ENDING BALANCE <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>

              {/* Comparison Headers matching reference screenshot */}
              {hasComparison && (
                <>
                  <th className="py-3 px-3 text-right font-semibold text-muted-foreground uppercase tracking-wider border-l bg-blue-50/40 dark:bg-blue-950/30">
                    ENDING {comparisonLabel.toUpperCase()}
                  </th>
                  <th className="py-3 px-3 text-right font-semibold text-muted-foreground uppercase tracking-wider border-l">
                    CHANGE
                  </th>
                </>
              )}

              <th className="py-3 px-3 text-center font-semibold text-muted-foreground uppercase tracking-wider w-28">
                ACTION
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredAccounts.map((acc) => {
              const compEnd = acc.comparisonBalance ?? 0;
              const compDiff = acc.comparisonChange ?? 0;
              const compPct = compEnd !== 0 ? (compDiff / Math.abs(compEnd)) * 100 : 0;

              return (
                <tr key={acc.glCode} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-foreground">{acc.accountTitle}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {acc.category}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-muted-foreground">{acc.glCode}</td>
                  <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                    {formatCurrency(acc.beginningBalance)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                    {acc.netMovement === 0 ? (
                      <span className="text-muted-foreground">No movement</span>
                    ) : (
                      <div>
                        <span className="text-foreground">{formatCurrency(acc.netMovement)}</span>
                        <div className="text-[10px] text-muted-foreground">
                          {formatPercent(acc.movementPercent)} vs beginning
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground whitespace-nowrap">
                    {formatCurrency(acc.endingBalance)}
                  </td>

                  {/* Comparison Data Cells */}
                  {hasComparison && (
                    <>
                      <td className="py-2.5 px-3 text-right font-mono text-muted-foreground border-l bg-blue-50/20 dark:bg-blue-950/10 whitespace-nowrap">
                        {compEnd === 0 ? (
                          <span className="text-muted-foreground/60">—</span>
                        ) : (
                          formatCurrency(compEnd)
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono border-l whitespace-nowrap">
                        {compDiff === 0 ? (
                          <span className="text-muted-foreground/60">—</span>
                        ) : (
                          <div
                            className={
                              compDiff > 0
                                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-rose-600 dark:text-rose-400 font-medium"
                            }
                          >
                            <span>
                              {compDiff > 0 ? `▲ +${formatCurrency(compDiff)}` : `▼ ${formatCurrency(compDiff)}`}
                            </span>
                            <div className="text-[10px]">
                              {compEnd !== 0
                                ? `${compDiff > 0 ? "+" : ""}${compPct.toFixed(1)}%`
                                : "n/m"}
                            </div>
                          </div>
                        )}
                      </td>
                    </>
                  )}

                  <td className="py-2.5 px-3 text-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openDrillDown(acc.glCode, acc.accountTitle)}
                    >
                      View entries
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-bold bg-muted/20">
              <td className="py-3 px-3" colSpan={2}>
                Total equity – all {accounts.length} accounts in the applied report
              </td>
              <td className="py-3 px-3 text-right font-mono">{formatCurrency(totalBeg)}</td>
              <td className="py-3 px-3 text-right font-mono">{formatCurrency(totalMov)}</td>
              <td className="py-3 px-3 text-right font-mono">{formatCurrency(totalEnd)}</td>

              {hasComparison && (
                <>
                  <td className="py-3 px-3 text-right font-mono border-l bg-blue-50/30 dark:bg-blue-950/20">
                    {totalCompEnd === 0 ? "—" : formatCurrency(totalCompEnd)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono border-l">
                    <span
                      className={
                        totalCompChange > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : totalCompChange < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : ""
                      }
                    >
                      {totalCompChange > 0
                        ? `+${formatCurrency(totalCompChange)}`
                        : totalCompChange < 0
                        ? formatCurrency(totalCompChange)
                        : "—"}
                    </span>
                  </td>
                </>
              )}

              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
