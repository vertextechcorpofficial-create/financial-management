"use client";

import React, { useState, useMemo } from "react";
import { useStatementOfChangesInEquity } from "../../../hooks/useStatementOfChangesInEquity";
import { formatCurrency, formatPercent } from "../../../utils/format";
import { SCEAccountBreakdownItem } from "../../../types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ArrowUpDown } from "lucide-react";

export function SCEAccountBreakdownTable() {
  const { data, openDrillDown } = useStatementOfChangesInEquity();
  const accounts = data?.accounts || [];

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

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm sm:p-4">
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
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{filteredAccounts.length}</span> matching accounts ·{" "}
          <span className="font-semibold text-foreground">{accounts.length}</span> in the applied report
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
              <th className="py-3 px-3 text-center font-semibold text-muted-foreground uppercase tracking-wider w-28">
                ACTION
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredAccounts.map((acc) => (
              <tr key={acc.glCode} className="hover:bg-muted/30 transition-colors">
                <td className="py-2.5 px-3">
                  <div className="font-medium text-foreground">{acc.accountTitle}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {acc.category}
                  </div>
                </td>
                <td className="py-2.5 px-3 font-mono text-muted-foreground">{acc.glCode}</td>
                <td className="py-2.5 px-3 text-right font-mono">
                  {formatCurrency(acc.beginningBalance)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono">
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
                <td className="py-2.5 px-3 text-right font-mono font-medium text-foreground">
                  {formatCurrency(acc.endingBalance)}
                </td>
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
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-bold bg-muted/20">
              <td className="py-3 px-3" colSpan={2}>
                Total equity – all {accounts.length} accounts in the applied report
              </td>
              <td className="py-3 px-3 text-right font-mono">{formatCurrency(totalBeg)}</td>
              <td className="py-3 px-3 text-right font-mono">{formatCurrency(totalMov)}</td>
              <td className="py-3 px-3 text-right font-mono">{formatCurrency(totalEnd)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
