"use client";

import React from "react";
import { useStatementOfChangesInEquity } from "../../../hooks/useStatementOfChangesInEquity";
import { formatCurrency } from "../../../utils/format";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export function SCEEquationBanner() {
  const { data, filters } = useStatementOfChangesInEquity();
  const eq = data?.equationCheck;

  if (!eq) return null;

  const isBalanced = eq.isBalanced;

  return (
    <div
      className={`rounded-lg border p-4 text-xs transition-colors ${
        isBalanced
          ? "bg-emerald-50/70 border-emerald-200 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
          : "bg-red-50/80 border-red-300 text-red-950 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200"
      }`}
    >
      {/* Title Header */}
      <div className="flex items-center gap-2 font-semibold">
        {isBalanced ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
        )}
        <span>Equity equation check · {filters.periodLabel}</span>
      </div>

      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {isBalanced
          ? "The statement reconciles with the General Ledger."
          : `Discrepancy detected: Variance of ${formatCurrency(eq.variance)}. Please verify unmapped entries or tags.`}
      </p>

      {/* Equation Term Cards */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-center font-mono">
        <div className="rounded border bg-card px-2.5 py-1.5 shadow-xs">
          <div className="text-[10px] text-muted-foreground">ENDING EQUITY (GL)</div>
          <div className="font-semibold text-foreground">{formatCurrency(eq.glEndingEquity)}</div>
        </div>

        <span className="font-bold text-muted-foreground text-sm">–</span>

        <span className="font-bold text-muted-foreground text-sm">(</span>

        <div className="rounded border bg-card px-2.5 py-1.5 shadow-xs">
          <div className="text-[10px] text-muted-foreground">BEGINNING (RESTATED)</div>
          <div className="font-semibold text-foreground">{formatCurrency(eq.restatedBeginningEquity)}</div>
        </div>

        <span className="font-bold text-muted-foreground text-sm">+</span>

        <div className="rounded border bg-card px-2.5 py-1.5 shadow-xs">
          <div className="text-[10px] text-muted-foreground">NET INCOME</div>
          <div className="font-semibold text-foreground">{formatCurrency(eq.netIncome)}</div>
        </div>

        <span className="font-bold text-muted-foreground text-sm">+</span>

        <div className="rounded border bg-card px-2.5 py-1.5 shadow-xs">
          <div className="text-[10px] text-muted-foreground">OCI</div>
          <div className="font-semibold text-foreground">{formatCurrency(eq.oci)}</div>
        </div>

        <span className="font-bold text-muted-foreground text-sm">+</span>

        <div className="rounded border bg-card px-2.5 py-1.5 shadow-xs">
          <div className="text-[10px] text-muted-foreground">CAPITAL CONTRIBUTIONS</div>
          <div className="font-semibold text-foreground">{formatCurrency(eq.capitalContributions)}</div>
        </div>

        <span className="font-bold text-muted-foreground text-sm">–</span>

        <div className="rounded border bg-card px-2.5 py-1.5 shadow-xs">
          <div className="text-[10px] text-muted-foreground">CASH DIVIDENDS</div>
          <div className="font-semibold text-foreground">{formatCurrency(eq.cashDividends)}</div>
        </div>

        <span className="font-bold text-muted-foreground text-sm">–</span>

        <div className="rounded border bg-card px-2.5 py-1.5 shadow-xs">
          <div className="text-[10px] text-muted-foreground">NET TREASURY PURCHASES</div>
          <div className="font-semibold text-foreground">{formatCurrency(eq.netTreasuryPurchases)}</div>
        </div>

        <span className="font-bold text-muted-foreground text-sm">)</span>

        <span className="font-bold text-muted-foreground text-sm">=</span>

        <div
          className={`rounded border px-2.5 py-1.5 shadow-xs font-semibold ${
            isBalanced
              ? "bg-card text-foreground"
              : "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/40 dark:border-red-700 dark:text-red-300"
          }`}
        >
          <div className="text-[10px] text-muted-foreground">VARIANCE</div>
          <div>{formatCurrency(eq.variance)}</div>
        </div>
      </div>

      {/* Sub-pills status */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center rounded-md border bg-card/80 px-2 py-0.5 text-foreground shadow-xs">
          Appropriation transfers net in Total Equity:{" "}
          <strong className="ml-1 text-emerald-600 dark:text-emerald-400">
            {formatCurrency(eq.appropriationTransferNet)}
          </strong>
        </span>
        <span className="inline-flex items-center rounded-md border bg-card/80 px-2 py-0.5 text-foreground shadow-xs">
          Stock dividend net effect:{" "}
          <strong className="ml-1 text-emerald-600 dark:text-emerald-400">
            {formatCurrency(eq.stockDividendNet)}
          </strong>
        </span>
        <span className="inline-flex items-center rounded-md border bg-card/80 px-2 py-0.5 text-foreground shadow-xs">
          Statement {formatCurrency(eq.statementEndingEquity)} vs GL {formatCurrency(eq.glEndingEquity)}
        </span>
        <span className="inline-flex items-center rounded-md border bg-card/80 px-2 py-0.5 text-foreground shadow-xs">
          Basis: {filters.basis === "restated" ? "restated (PAS 8)" : "previously reported"}
        </span>
      </div>
    </div>
  );
}
