"use client";

import React from "react";
import { useStatementOfChangesInEquity } from "../hooks/useStatementOfChangesInEquity";
import { formatCurrency } from "../utils/format";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, CheckCircle2, AlertTriangle, Layers, TrendingUp } from "lucide-react";

export function SCESummaryCards() {
  const { data, filters, openDrillDown, openCellDrillDown } = useStatementOfChangesInEquity();

  const cards = data?.summaryCards;
  const accounts = data?.accounts || [];
  const isSegment = cards?.isSegmentView ?? false;
  const isReconciled = cards?.isReconciled ?? true;

  const handleOpenBeginningBreakdown = () => {
    const contributingAccounts = accounts
      .map((acc) => ({
        glCode: acc.glCode,
        accountTitle: acc.accountTitle,
        category: acc.category,
        amount: acc.beginningBalance,
      }))
      .filter((a) => a.amount !== 0);

    openCellDrillDown({
      columnKey: "totalEquity",
      columnTitle: "Total Corporate Equity",
      rowLabel: "Beginning Total Equity",
      totalAmount: cards?.beginningEquity || 0,
      periodLabel: filters.periodLabel,
      contributingAccounts,
    });
  };

  const handleOpenEndingBreakdown = () => {
    const contributingAccounts = accounts
      .map((acc) => ({
        glCode: acc.glCode,
        accountTitle: acc.accountTitle,
        category: acc.category,
        amount: acc.endingBalance,
      }))
      .filter((a) => a.amount !== 0);

    openCellDrillDown({
      columnKey: "totalEquity",
      columnTitle: "Total Corporate Equity",
      rowLabel: "Ending Total Equity",
      totalAmount: cards?.endingEquity || 0,
      periodLabel: filters.periodLabel,
      contributingAccounts,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Card 1: Beginning Total Equity */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Beginning Total Equity</span>
              <Layers className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {isSegment ? "—" : formatCurrency(cards?.beginningEquity)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {isSegment ? "Entity level balance" : "As of start date"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenBeginningBreakdown}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline text-left cursor-pointer"
          >
            View breakdown <ArrowUpRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>

      {/* Card 2: Net Income / (Loss) */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Net Income / (Loss)</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {formatCurrency(cards?.netIncome)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              Via Current Net Income (GL 3900)
            </div>
          </div>
          <button
            type="button"
            onClick={() => openDrillDown("3900", "Current Net Income")}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline text-left cursor-pointer"
          >
            View breakdown <ArrowUpRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>

      {/* Card 3: Net Capital & Dividend Movements */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Net Capital & Dividend Movements</span>
              <Layers className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {formatCurrency(cards?.netCapitalAndDividend)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              Issuances {formatCurrency(cards?.issuances)} · Dividends {formatCurrency(cards?.dividends)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => openDrillDown("3510", "Dividends & Capital Movements")}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline text-left cursor-pointer"
          >
            View breakdown <ArrowUpRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>

      {/* Card 4: Ending Total Equity (turns red on variance) */}
      <Card
        className={`shadow-sm transition-colors ${
          !isReconciled
            ? "bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-800"
            : ""
        }`}
      >
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{isSegment ? "Net Equity Activity (Segment)" : "Ending Total Equity"}</span>
              {isReconciled ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div
              className={`mt-2 text-xl font-bold tracking-tight sm:text-2xl ${
                !isReconciled ? "text-red-700 dark:text-red-300" : "text-foreground"
              }`}
            >
              {isSegment
                ? formatCurrency(cards?.segmentNetActivity)
                : formatCurrency(cards?.endingEquity)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {isReconciled
                ? "Reconciled · agrees with GL equity"
                : `Variance: ${formatCurrency(cards?.variance)}`}
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenEndingBreakdown}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline text-left cursor-pointer"
          >
            View breakdown <ArrowUpRight className="h-3 w-3" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
