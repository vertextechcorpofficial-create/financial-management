"use client";

import React, { useMemo } from "react";
import { useStatementOfChangesInEquity } from "../hooks/useStatementOfChangesInEquity";
import { SCEViewBy, SCECompareMode } from "../types";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

export function SCEReportControlSection() {
  const {
    filters,
    setViewBy,
    setPeriodDate,
    stepPrevPeriod,
    stepNextPeriod,
    setCompare,
    setCompareMode,
  } = useStatementOfChangesInEquity();

  // Period options for SearchableSelect
  const periodOptions = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    if (filters.viewBy === "Monthly") {
      // 2024 to 2026 Oct
      for (let y = 2026; y >= 2024; y--) {
        const maxM = y === 2026 ? 9 : 11;
        for (let m = maxM; m >= 0; m--) {
          const lastDay = new Date(y, m + 1, 0).getDate();
          const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
          list.push({
            value: dateStr,
            label: `${months[m]} ${y}`,
          });
        }
      }
    } else if (filters.viewBy === "Quarterly") {
      for (let y = 2026; y >= 2024; y--) {
        const maxQ = y === 2026 ? 4 : 4;
        for (let q = maxQ; q >= 1; q--) {
          const m = q * 3;
          const lastDay = new Date(y, m, 0).getDate();
          const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
          list.push({
            value: dateStr,
            label: `Q${q} ${y}${q === 4 && y === 2026 ? " (to date)" : ""}`,
          });
        }
      }
    } else {
      list.push(
        { value: "2026-10-31", label: "FY 2026 (YTD)" },
        { value: "2025-12-31", label: "FY 2025" },
        { value: "2024-12-31", label: "FY 2024" }
      );
    }
    return list;
  }, [filters.viewBy]);

  const compareModeOptions = [
    { value: "previous_period", label: "Previous period" },
    { value: "same_period_last_year", label: "Same period last year" },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm sm:p-4">
      {/* Top filter row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
        {/* View by buttons */}
        <div className="flex flex-col gap-1.5 lg:col-span-3">
          <Label className="text-xs font-medium text-muted-foreground uppercase">
            VIEW BY
          </Label>
          <div className="flex rounded-md border p-1 bg-muted/40">
            {(["Monthly", "Quarterly", "Annually"] as SCEViewBy[]).map((v) => (
              <Button
                key={v}
                type="button"
                variant={filters.viewBy === v ? "default" : "ghost"}
                size="sm"
                className="flex-1 h-8 text-xs font-medium"
                onClick={() => setViewBy(v)}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>

        {/* Period Selector with Stepper */}
        <div className="flex flex-col gap-1.5 lg:col-span-3">
          <Label className="text-xs font-medium text-muted-foreground uppercase">
            PERIOD
          </Label>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={stepPrevPeriod}
              title="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-[140px]">
              <SearchableSelect
                options={periodOptions}
                value={filters.periodDate}
                onValueChange={setPeriodDate}
                placeholder="Select period..."
                className="h-9 w-full text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={stepNextPeriod}
              title="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Date Range Derived Display */}
        <div className="flex flex-col gap-1.5 lg:col-span-3">
          <Label className="text-xs font-medium text-muted-foreground uppercase">
            DATE RANGE
          </Label>
          <div className="flex h-9 items-center justify-between rounded-md border bg-muted/30 px-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 truncate">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium text-foreground truncate">
                {filters.startDate} – {filters.endDate}
              </span>
            </div>
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground shrink-0">
              {filters.daysCount} days
            </span>
          </div>
        </div>

        {/* Comparison Toggle & Mode */}
        <div className="flex flex-col gap-1.5 lg:col-span-3">
          <Label className="text-xs font-medium text-muted-foreground uppercase">
            COMPARISON
          </Label>
          <div className="flex items-center gap-2 h-9">
            <div className="flex items-center gap-1.5 shrink-0">
              <Switch
                id="compare-switch"
                checked={filters.compare}
                onCheckedChange={setCompare}
              />
              <Label htmlFor="compare-switch" className="text-xs font-medium cursor-pointer">
                Compare
              </Label>
            </div>
            {filters.compare && (
              <div className="flex-1 min-w-[150px]">
                <SearchableSelect
                  options={compareModeOptions}
                  value={filters.compareMode}
                  onValueChange={(v) => setCompareMode(v as SCECompareMode)}
                  placeholder="Select comparison..."
                  className="h-9 w-full text-xs"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
