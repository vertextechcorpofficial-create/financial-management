"use client";

import React from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPHPWithSign, formatPercent } from "../utils/cfs-format";
import { Activity, Building2, Landmark, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

interface CFSSummaryCardsProps {
  onScrollToSection?: (sectionId: string) => void;
}

export function CFSSummaryCards({ onScrollToSection }: CFSSummaryCardsProps) {
  const { data, filters, isLoading } = useCashFlowStudio();
  const m = data.summaryMetrics;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-4 w-20 mt-2" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. OPERATING */}
      <Card className="relative overflow-hidden border-border bg-card p-4 transition-all hover:border-primary/50">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-semibold text-muted-foreground">
            Net cash from operating activities
          </span>
          <Activity className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {formatPHPWithSign(m.operating.amount)}
          </span>
          {filters.compare && m.operating.changePct !== undefined && (
            <span className="text-xs font-semibold text-emerald-500">
              {formatPercent(m.operating.changePct)}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
          {m.operating.description}
        </p>
        <button
          type="button"
          onClick={() => onScrollToSection?.("sec-op")}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View breakdown <ArrowRight className="h-3 w-3" />
        </button>
      </Card>

      {/* 2. INVESTING */}
      <Card className="relative overflow-hidden border-border bg-card p-4 transition-all hover:border-primary/50">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-semibold text-muted-foreground">
            Net cash from investing activities
          </span>
          <Building2 className="h-4 w-4 text-blue-500" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {formatPHPWithSign(m.investing.amount)}
          </span>
          {filters.compare && m.investing.changePct !== undefined && (
            <span className="text-xs font-semibold text-blue-500">
              {formatPercent(m.investing.changePct)}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
          {m.investing.description}
        </p>
        <button
          type="button"
          onClick={() => onScrollToSection?.("sec-inv")}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View breakdown <ArrowRight className="h-3 w-3" />
        </button>
      </Card>

      {/* 3. FINANCING */}
      <Card className="relative overflow-hidden border-border bg-card p-4 transition-all hover:border-primary/50">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-semibold text-muted-foreground">
            Net cash from financing activities
          </span>
          <Landmark className="h-4 w-4 text-purple-500" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {formatPHPWithSign(m.financing.amount)}
          </span>
          {filters.compare && m.financing.changePct !== undefined && (
            <span className="text-xs font-semibold text-purple-500">
              {formatPercent(m.financing.changePct)}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
          {m.financing.description}
        </p>
        <button
          type="button"
          onClick={() => onScrollToSection?.("sec-fin")}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View breakdown <ArrowRight className="h-3 w-3" />
        </button>
      </Card>

      {/* 4. ENDING CASH */}
      <Card className="relative overflow-hidden border-border bg-card p-4 transition-all hover:border-primary/50">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-semibold text-muted-foreground">
            Ending cash & cash equivalents
          </span>
          {m.endingCash.isReconciled ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-2xl font-bold tracking-tight ${m.endingCash.isReconciled ? "text-foreground" : "text-rose-500"}`}>
            {formatPHPWithSign(m.endingCash.amount)}
          </span>
          {filters.compare && m.endingCash.changePct !== undefined && (
            <span className="text-xs font-semibold text-emerald-500">
              {formatPercent(m.endingCash.changePct)}
            </span>
          )}
        </div>
        <p className={`mt-2 text-xs line-clamp-2 min-h-[32px] ${m.endingCash.isReconciled ? "text-muted-foreground" : "text-rose-500 font-medium"}`}>
          {m.endingCash.description}
        </p>
        <button
          type="button"
          onClick={() => onScrollToSection?.("end-cash")}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View breakdown <ArrowRight className="h-3 w-3" />
        </button>
      </Card>
    </div>
  );
}
