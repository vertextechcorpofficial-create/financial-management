import React from "react";
import type { ApprovalsKPIs } from "../types";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined || val === 0) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface ApprovalsKPICardsProps {
  kpis: ApprovalsKPIs;
}

export default function ApprovalsKPICards({ kpis }: ApprovalsKPICardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* 1. WAITING FOR APPROVAL - Tan/Soft yellow card matching design */}
      <div className="bg-[#fef9ee]/80 border border-[#fef08a] rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-[#854d0e] uppercase block">
          WAITING FOR APPROVAL
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.waitingCount}
        </div>
      </div>

      {/* 2. VALUE WAITING */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          VALUE WAITING
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {formatCurrency(kpis.valueWaiting)}
        </div>
      </div>

      {/* 3. APPROVAL THRESHOLD */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          APPROVAL THRESHOLD
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {formatCurrency(kpis.approvalThreshold)}
        </div>
      </div>

      {/* 4. APPLIES TO */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          APPLIES TO
        </span>
        <div className="text-xs font-medium text-foreground leading-snug pt-1">
          {kpis.appliesToText}
        </div>
      </div>
    </div>
  );
}
