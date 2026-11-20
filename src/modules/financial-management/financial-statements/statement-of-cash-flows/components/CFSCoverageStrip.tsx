"use client";

import React from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function CFSCoverageStrip() {
  const { filters, data, refreshData, isLoading } = useCashFlowStudio();

  return (
    <div className="flex flex-col gap-2 print:hidden">
      {/* Primary Strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-xs border border-muted/40">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Report coverage:</span>
          <span className="font-semibold">{filters.startDate} to {filters.endDate}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Compared with:</span>
          <span className="font-semibold">{filters.compare ? filters.comparePeriodLabel : "—"}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Entity:</span>
          <span className="font-semibold">{data.entity.name}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Basis:</span>
          <span className="font-semibold">{data.basis}</span>
        </div>
      </div>

      {/* Update Line */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div suppressHydrationWarning>
          Live ledger query · Last loaded: {data.lastUpdated}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={refreshData}
          disabled={isLoading}
          className="h-7 text-xs gap-1.5 hover:bg-muted"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
