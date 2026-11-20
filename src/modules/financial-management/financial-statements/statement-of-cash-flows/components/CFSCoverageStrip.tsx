"use client";

import React from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function CFSCoverageStrip() {
  const { filters, data, setSimulateUnmapped, refreshData, isLoading } = useCashFlowStudio();

  return (
    <div className="flex flex-col gap-2">
      {/* Primary Strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-xs border border-muted/40">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Report coverage:</span>
          <span className="font-semibold">{filters.dateRangeLabel.split(" ")[0]} {filters.dateRangeLabel.split(" ")[1]} – {filters.dateRangeLabel.split(" ")[3]} {filters.dateRangeLabel.split(" ")[4]} {filters.dateRangeLabel.split(" ")[5]}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Compared with:</span>
          <span className="font-semibold">{filters.compare ? filters.comparePeriodLabel : "—"}</span>
        </div>
        <div className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Status:</span>
          <span className="font-semibold">{data.status}</span>
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

      {/* Update Line with Simulation toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div>
          Report updated. Last updated {data.lastUpdated} · ledger posted through {data.ledgerPostedThrough}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="simulate-unmapped"
              checked={filters.simulateUnmapped}
              onCheckedChange={setSimulateUnmapped}
            />
            <Label htmlFor="simulate-unmapped" className="text-xs cursor-pointer select-none">
              Test: simulate unmapped GL accounts
            </Label>
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
    </div>
  );
}
