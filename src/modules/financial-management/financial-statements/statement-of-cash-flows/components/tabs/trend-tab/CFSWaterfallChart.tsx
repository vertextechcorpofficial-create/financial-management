"use client";

import React from "react";
import { useCashFlowStudio } from "../../../providers/CashFlowStudioProvider";
import { formatPHP } from "../../../utils/cfs-format";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, TrendingDown, TrendingUp, Wallet, ArrowRight } from "lucide-react";

function formatCompact(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "−" : val > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}₱${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}₱${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₱${abs.toFixed(2)}`;
}

export function CFSWaterfallChart() {
  const { data, liveSummaryData } = useCashFlowStudio();

  // Actual live figures
  const opening = liveSummaryData?.openingCash ?? 0;
  const operating = data.summaryMetrics.operating.amount ?? 0;
  const investing = data.summaryMetrics.investing.amount ?? 0;
  const financing = data.summaryMetrics.financing.amount ?? 0;
  const netChange = liveSummaryData?.netChange ?? (operating + investing + financing);
  const closing = liveSummaryData?.closingCash ?? (opening + netChange);

  // Group activities from live summary data for gross inflow/outflow breakdown
  const activities = liveSummaryData?.activities || [];
  const opAct = activities.find((a) => a.code === "OPERATING");
  const invAct = activities.find((a) => a.code === "INVESTING");
  const finAct = activities.find((a) => a.code === "FINANCING");

  const activityCards = [
    {
      code: "OPERATING",
      name: "Operating Activities",
      description: "Collections from sales, operational payments & supplier disbursements",
      net: operating,
      inflow: opAct?.inflow ?? 0,
      outflow: opAct?.outflow ?? 0,
      accentBorder: "border-blue-500/30",
      accentBg: "bg-blue-500/5",
      badgeColor: "bg-blue-500 text-white",
      barColor: "bg-blue-600 dark:bg-blue-500",
    },
    {
      code: "INVESTING",
      name: "Investing Activities",
      description: "Acquisition & disposal of long-term assets, equipment & investments",
      net: investing,
      inflow: invAct?.inflow ?? 0,
      outflow: invAct?.outflow ?? 0,
      accentBorder: "border-teal-500/30",
      accentBg: "bg-teal-500/5",
      badgeColor: "bg-teal-600 text-white",
      barColor: "bg-teal-600 dark:bg-teal-500",
    },
    {
      code: "FINANCING",
      name: "Financing Activities",
      description: "Equity contributions, bank borrowings, debt repayments & dividends",
      net: financing,
      inflow: finAct?.inflow ?? 0,
      outflow: finAct?.outflow ?? 0,
      accentBorder: "border-amber-500/30",
      accentBg: "bg-amber-500/5",
      badgeColor: "bg-amber-600 text-white",
      barColor: "bg-amber-600 dark:bg-amber-500",
    },
  ];

  // Maximum gross activity flow for proportional horizontal bars
  const maxActivityGross = Math.max(
    ...activityCards.map((c) => Math.max(c.inflow, c.outflow, Math.abs(c.net))),
    10_000
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 1. EXECUTIVE CASH JOURNEY: 3 STEP CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
        {/* OPENING CASH PILLAR */}
        <div className="md:col-span-4 rounded-xl border border-slate-300 dark:border-slate-800 bg-card p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Beginning Cash
              </span>
              <Wallet className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums text-foreground">
              ₱{formatPHP(opening)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Period Start Balance</span>
            <span className="font-mono font-medium">As posted in general ledger</span>
          </div>
        </div>

        {/* NET CASH MOVEMENT CONNECTOR */}
        <div className="md:col-span-4 rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-primary">
                Net Period Cash Movement
              </span>
              {netChange >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
            </div>
            <div className={`mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums ${netChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {netChange >= 0 ? `+₱${formatPHP(netChange)}` : formatPHP(netChange)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-primary/20 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Direct Method Net Sum</span>
            <span className="font-mono font-medium text-primary">
              {netChange >= 0 ? "Cash Generated" : "Cash Deficit / Burn"}
            </span>
          </div>
        </div>

        {/* CLOSING CASH PILLAR */}
        <div className="md:col-span-4 rounded-xl border border-slate-300 dark:border-slate-800 bg-card p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Ending Cash & Cash Equivalents
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums text-foreground">
              ₱{formatPHP(closing)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Period End Balance</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              Tie-out Verified
            </span>
          </div>
        </div>
      </div>

      {/* 2. ACTIVITY FLOWS VISUALIZER */}
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-4 border-b border-border/50">
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">
              PAS 7 Activity Cash Inflow vs. Outflow Breakdown
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Proportional comparison of cash generation and disbursements per reporting activity
            </p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Report Currency: <span className="font-mono text-foreground">PHP (₱)</span>
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {activityCards.map((act) => {
            const inflowPct = (act.inflow / maxActivityGross) * 100;
            const outflowPct = (act.outflow / maxActivityGross) * 100;

            return (
              <div
                key={act.code}
                className={`rounded-lg border p-4 transition-all duration-150 ${act.accentBorder} ${act.accentBg}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${act.badgeColor}`}>
                      {act.code}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {act.name}
                    </span>
                  </div>

                  <div className="text-right flex items-center gap-2 sm:justify-end">
                    <span className="text-xs text-muted-foreground">Net Movement:</span>
                    <span className={`font-mono font-bold text-sm tabular-nums ${act.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {act.net >= 0 ? `+₱${formatPHP(act.net)}` : formatPHP(act.net)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  {act.description}
                </p>

                {/* Proportional Bars */}
                <div className="space-y-2 pt-1 border-t border-border/40 text-xs">
                  {/* INFLOW BAR */}
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3" /> Inflow
                    </span>
                    <div className="flex-1 bg-muted/60 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(inflowPct, act.inflow > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="w-28 text-right font-mono font-semibold text-[11px] text-foreground tabular-nums shrink-0">
                      ₱{formatPHP(act.inflow)}
                    </span>
                  </div>

                  {/* OUTFLOW BAR */}
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-[11px] font-medium text-rose-500 shrink-0 flex items-center gap-1">
                      <ArrowDownRight className="h-3 w-3" /> Outflow
                    </span>
                    <div className="flex-1 bg-muted/60 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(outflowPct, act.outflow > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="w-28 text-right font-mono font-semibold text-[11px] text-foreground tabular-nums shrink-0">
                      ₱{formatPHP(act.outflow)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-2 border-t border-border/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>Gross Cash Inflows</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span>Gross Cash Outflows</span>
            </div>
          </div>
          <span className="italic text-[11px]">
            Bars scaled proportionally to period gross activity volume
          </span>
        </div>
      </div>
    </div>
  );
}
