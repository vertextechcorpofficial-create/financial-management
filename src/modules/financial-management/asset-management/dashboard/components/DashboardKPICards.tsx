import React from "react";
import type { AssetDashboardMetrics } from "../types";

const formatNumber = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface DashboardKPICardsProps {
  metrics: AssetDashboardMetrics;
}

export default function DashboardKPICards({ metrics }: DashboardKPICardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. COST / VALUATION */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-2">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          Cost / Valuation
        </span>
        <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">
          {formatNumber(metrics.costValuation)}
        </div>
      </div>

      {/* 2. ACCUM. DEPRECIATION & IMPAIRMENT */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-2">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block leading-tight">
          Accum. Depreciation & Impairment
        </span>
        <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">
          {formatNumber(metrics.accumulatedDepreciationAndImpairment)}
        </div>
      </div>

      {/* 3. CARRYING AMOUNT (PPE) - Highlighted in Emerald/Dark Green */}
      <div className="bg-[#1b4332] text-white border border-[#1b4332] rounded-xl p-4 shadow-xs space-y-2">
        <span className="text-[10px] font-bold tracking-wider uppercase block text-emerald-100">
          Carrying Amount (PPE)
        </span>
        <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white">
          {formatNumber(metrics.carryingAmountPPE)}
        </div>
      </div>

      {/* 4. DEPRECIATION 2026 YTD */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-2">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          Depreciation 2026 YTD
        </span>
        <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">
          {formatNumber(metrics.depreciationYTD)}
        </div>
      </div>

      {/* 5. HELD FOR SALE (IFRS 5) */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-2">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          Held For Sale (IFRS 5)
        </span>
        <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">
          {metrics.heldForSale !== null ? formatNumber(metrics.heldForSale) : "—"}
        </div>
      </div>

      {/* 6. ASSETS IN USE */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-2">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          Assets in Use
        </span>
        <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground">
          {metrics.assetsInUse}
        </div>
      </div>
    </div>
  );
}
