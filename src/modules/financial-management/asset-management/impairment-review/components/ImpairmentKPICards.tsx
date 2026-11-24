import React from "react";
import { Calendar } from "lucide-react";
import type { ImpairmentKPIData } from "../types";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined || val === 0) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

interface ImpairmentKPICardsProps {
  kpis: ImpairmentKPIData;
  onUpdateDate?: (newDate: string) => void;
  isSignedOff?: boolean;
}

export default function ImpairmentKPICards({
  kpis,
  onUpdateDate,
  isSignedOff = false,
}: ImpairmentKPICardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* 1. REVIEW DATE with optional Change Date control */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
            REVIEW DATE
          </span>
          {!isSignedOff && onUpdateDate && (
            <label className="text-[10px] text-blue-600 hover:underline cursor-pointer font-medium relative inline-flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              <span>Change</span>
              <input
                type="date"
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                onChange={(e) => {
                  if (e.target.value) onUpdateDate(e.target.value);
                }}
              />
            </label>
          )}
        </div>
        <div className="text-xs sm:text-sm font-semibold text-foreground truncate">
          {kpis.reviewDate} &bull; {kpis.reviewName}
        </div>
      </div>

      {/* 2. ASSETS WITH INDICATORS - Highlighted soft-yellow card */}
      <div className="bg-[#fef9ee]/80 border border-[#fef08a] rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-[#854d0e] uppercase block">
          ASSETS WITH INDICATORS
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.assetsWithIndicators}
        </div>
      </div>

      {/* 3. CONCLUDED */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          CONCLUDED
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {kpis.concludedCount} / {kpis.totalCount}
        </div>
      </div>

      {/* 4. CARRYING AMOUNT FLAGGED */}
      <div className="bg-card border rounded-xl p-4 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          CARRYING AMOUNT FLAGGED
        </span>
        <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
          {formatCurrency(kpis.carryingAmountFlagged)}
        </div>
      </div>
    </div>
  );
}
