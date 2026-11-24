import React from "react";
import type { AssetSummaryKPIs } from "../types";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface AssetSummaryKPICardsProps {
  kpis: AssetSummaryKPIs;
  groupLabel?: string;
}

export default function AssetSummaryKPICards({
  kpis,
  groupLabel = "ITEM NAME GROUPS",
}: AssetSummaryKPICardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* 1. GROUPS COUNT */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          {groupLabel}
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.groupCount}
        </div>
      </div>

      {/* 2. UNITS IN USE */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          UNITS IN USE
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.unitsInUse}
        </div>
      </div>

      {/* 3. DISPOSED / HELD FOR SALE */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          DISPOSED / HELD FOR SALE
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.disposedOrHeldForSale}
        </div>
      </div>

      {/* 4. PROJECTED VALUE - Dark Green Card matching design */}
      <div className="bg-[#1b4332] text-white border border-[#1b4332] rounded-xl p-4 shadow-xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider uppercase block text-emerald-100">
          PROJECTED VALUE
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white">
          {formatCurrency(kpis.projectedValue)}
        </div>
      </div>
    </div>
  );
}
