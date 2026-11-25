import React from "react";
import type { PeriodCloseData } from "../types";

interface PeriodCloseKPICardsProps {
  data: PeriodCloseData;
}

export default function PeriodCloseKPICards({ data }: PeriodCloseKPICardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Closed Through (Highlighted in dark green card like screenshot) */}
      <div className="rounded-xl p-5 shadow-2xs bg-[#1b4332] text-white space-y-1">
        <span className="text-[10px] font-bold tracking-wider uppercase opacity-80 block">
          CLOSED THROUGH
        </span>
        <div className="text-2xl font-bold font-mono tracking-tight">
          {data.closedThroughLabel || "None"}
        </div>
      </div>

      {/* 2. Open Period */}
      <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          OPEN PERIOD
        </span>
        <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
          {data.openPeriodLabel || "Nov 2026"}
        </div>
      </div>

      {/* 3. Last Closed By */}
      <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          LAST CLOSED BY
        </span>
        <div className="text-sm font-semibold text-foreground pt-1 truncate">
          {data.lastClosedBy || "—"}
        </div>
      </div>

      {/* 4. Posted vs Register */}
      <div className="bg-card border rounded-xl p-5 shadow-2xs space-y-1">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          POSTED VS REGISTER
        </span>
        <div className="pt-1">
          {data.postedVsRegister === "Reconciled" ? (
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              RECONCILED &#10003;
            </span>
          ) : (
            <span className="text-sm font-bold text-destructive">
              {data.varianceCount} VARIANCE(S)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
