"use client";

import React, { useState, useEffect } from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { CFSViewBy, CFSCompareOption, CFSFilterState } from "../types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Filter } from "lucide-react";

export function CFSControlSection() {
  const { filters, applyFilters, isLoading } = useCashFlowStudio();

  // Local draft filter state to hold selections until user clicks "Apply Filter"
  const [draftFilters, setDraftFilters] = useState<CFSFilterState>(filters);

  // Sync draft state if external filters change
  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  const isDirty =
    draftFilters.viewBy !== filters.viewBy ||
    draftFilters.periodLabel !== filters.periodLabel ||
    draftFilters.compare !== filters.compare ||
    draftFilters.compareOption !== filters.compareOption;

  const handleViewByChange = (mode: CFSViewBy) => {
    let periodLabel = "FY 2026 H1";
    let dateRangeLabel = "Jan 1 – Jun 30, 2026";
    let comparePeriodLabel = "Previous year (FY 2025)";
    let startDate = "2026-01-01";
    let endDate = "2026-06-30";
    let compareStartDate = "2025-01-01";
    let compareEndDate = "2025-06-30";

    if (mode === "Monthly") {
      periodLabel = "May 2026";
      dateRangeLabel = "May 1 – May 31, 2026";
      comparePeriodLabel = "Previous month (Apr 2026)";
      startDate = "2026-05-01";
      endDate = "2026-05-31";
      compareStartDate = "2026-04-01";
      compareEndDate = "2026-04-30";
    } else if (mode === "Quarterly") {
      periodLabel = "Q1 2026";
      dateRangeLabel = "Jan 1 – Mar 31, 2026";
      comparePeriodLabel = "Previous quarter (Q4 2025)";
      startDate = "2026-01-01";
      endDate = "2026-03-31";
      compareStartDate = "2025-10-01";
      compareEndDate = "2025-12-31";
    }

    setDraftFilters((prev) => ({
      ...prev,
      viewBy: mode,
      periodLabel,
      dateRangeLabel,
      comparePeriodLabel,
      startDate,
      endDate,
      compareStartDate,
      compareEndDate,
    }));
  };

  const handlePeriodChange = (val: string) => {
    let startDate = draftFilters.startDate;
    let endDate = draftFilters.endDate;
    let dateRangeLabel = draftFilters.dateRangeLabel;

    if (draftFilters.viewBy === "Annually") {
      if (val === "FY 2026 YTD" || val === "FY 2026 H1") {
        startDate = "2026-01-01";
        endDate = "2026-06-30";
        dateRangeLabel = "Jan 1 – Jun 30, 2026";
      } else if (val === "FY 2025") {
        startDate = "2025-01-01";
        endDate = "2025-12-31";
        dateRangeLabel = "Jan 1 – Dec 31, 2025";
      } else if (val === "FY 2024") {
        startDate = "2024-01-01";
        endDate = "2024-12-31";
        dateRangeLabel = "Jan 1 – Dec 31, 2024";
      }
    } else if (draftFilters.viewBy === "Quarterly") {
      if (val === "Q1 2026") {
        startDate = "2026-01-01";
        endDate = "2026-03-31";
        dateRangeLabel = "Jan 1 – Mar 31, 2026";
      } else if (val === "Q2 2026") {
        startDate = "2026-04-01";
        endDate = "2026-06-30";
        dateRangeLabel = "Apr 1 – Jun 30, 2026";
      } else if (val === "Q3 2026") {
        startDate = "2026-07-01";
        endDate = "2026-09-30";
        dateRangeLabel = "Jul 1 – Sep 30, 2026";
      }
    } else if (draftFilters.viewBy === "Monthly") {
      if (val === "Sep 2026") {
        startDate = "2026-09-01";
        endDate = "2026-09-30";
        dateRangeLabel = "Sep 1 – Sep 30, 2026";
      } else if (val === "Aug 2026") {
        startDate = "2026-08-01";
        endDate = "2026-08-31";
        dateRangeLabel = "Aug 1 – Aug 31, 2026";
      } else if (val === "Jul 2026") {
        startDate = "2026-07-01";
        endDate = "2026-07-31";
        dateRangeLabel = "Jul 1 – Jul 31, 2026";
      } else if (val === "May 2026") {
        startDate = "2026-05-01";
        endDate = "2026-05-31";
        dateRangeLabel = "May 1 – May 31, 2026";
      }
    }

    setDraftFilters((prev) => ({
      ...prev,
      periodLabel: val,
      periodDate: endDate,
      startDate,
      endDate,
      dateRangeLabel,
    }));
  };

  const handleApplyFilter = () => {
    applyFilters(draftFilters);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
        {/* VIEW BY TOGGLE */}
        <div className="flex flex-col gap-1.5 lg:col-span-3">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            VIEW BY
          </Label>
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            {(["Monthly", "Quarterly", "Annually"] as CFSViewBy[]).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={draftFilters.viewBy === mode ? "default" : "ghost"}
                size="sm"
                className={`h-8 flex-1 text-xs font-medium ${
                  draftFilters.viewBy === mode ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
                }`}
                onClick={() => handleViewByChange(mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>

        {/* FISCAL YEAR / PERIOD PICKER */}
        <div className="flex flex-col gap-1.5 lg:col-span-4">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {draftFilters.viewBy === "Monthly"
              ? "MONTH"
              : draftFilters.viewBy === "Quarterly"
              ? "QUARTER"
              : "FISCAL YEAR"}
          </Label>
          <div className="flex items-center gap-1">
            <Select
              value={draftFilters.periodLabel || undefined}
              onValueChange={handlePeriodChange}
            >
              <SelectTrigger className="h-9 flex-1 bg-background border-muted font-medium text-xs">
                <SelectValue placeholder={draftFilters.periodLabel || "Select period"} />
              </SelectTrigger>
              <SelectContent>
                {draftFilters.viewBy === "Annually" && (
                  <>
                    <SelectItem value="FY 2026 H1">FY 2026 H1</SelectItem>
                    <SelectItem value="FY 2026 YTD">FY 2026 YTD</SelectItem>
                    <SelectItem value="FY 2025">FY 2025</SelectItem>
                    <SelectItem value="FY 2024">FY 2024</SelectItem>
                  </>
                )}
                {draftFilters.viewBy === "Quarterly" && (
                  <>
                    <SelectItem value="Q3 2026">Q3 2026</SelectItem>
                    <SelectItem value="Q2 2026">Q2 2026</SelectItem>
                    <SelectItem value="Q1 2026">Q1 2026</SelectItem>
                  </>
                )}
                {draftFilters.viewBy === "Monthly" && (
                  <>
                    <SelectItem value="Sep 2026">Sep 2026</SelectItem>
                    <SelectItem value="Aug 2026">Aug 2026</SelectItem>
                    <SelectItem value="Jul 2026">Jul 2026</SelectItem>
                    <SelectItem value="May 2026">May 2026</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* DATE RANGE */}
        <div className="flex flex-col gap-1.5 lg:col-span-5">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            DATE RANGE
          </Label>
          <div className="flex h-9 items-center gap-2 rounded-md border border-muted bg-background/50 px-3 text-xs text-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{draftFilters.dateRangeLabel}</span>
          </div>
        </div>
      </div>

      {/* COMPARISON ROW & APPLY FILTER BUTTON */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-muted/50 pt-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              COMPARISON
            </Label>
            <div className="flex items-center gap-2">
              <Switch
                id="cfs-compare-toggle"
                checked={draftFilters.compare}
                onCheckedChange={(checked) =>
                  setDraftFilters((prev) => ({ ...prev, compare: checked }))
                }
              />
              <Label htmlFor="cfs-compare-toggle" className="text-xs font-semibold cursor-pointer">
                Compare
              </Label>
            </div>
          </div>

          {draftFilters.compare && (
            <div className="flex items-center gap-2 animate-in fade-in duration-200">
              <Select
                value={draftFilters.compareOption}
                onValueChange={(val) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    compareOption: val as CFSCompareOption,
                    comparePeriodLabel:
                      val === "previous_year"
                        ? `Previous year (${draftFilters.viewBy === "Annually" ? "FY 2025" : "Same period last year"})`
                        : val === "previous_period"
                        ? `Previous period (${draftFilters.viewBy === "Annually" ? "FY 2025" : "Prior period"})`
                        : "Custom period",
                  }))
                }
              >
                <SelectTrigger className="h-8 w-[230px] bg-background border-muted text-xs font-medium">
                  <SelectValue placeholder="Compare with..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="previous_year">
                    Previous year ({draftFilters.viewBy === "Annually" ? "FY 2025" : "Same period last year"})
                  </SelectItem>
                  <SelectItem value="previous_period">
                    Previous period ({draftFilters.viewBy === "Annually" ? "FY 2025" : "Prior month/quarter"})
                  </SelectItem>
                  <SelectItem value="custom">Custom period</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* APPLY FILTER ACTION BUTTON */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-[11px] text-amber-500 font-medium">
              Unapplied filter changes
            </span>
          )}
          <Button
            type="button"
            onClick={handleApplyFilter}
            disabled={isLoading || !isDirty}
            className="h-8 px-4 text-xs font-semibold gap-1.5 shadow-sm transition-all"
          >
            <Filter className="h-3.5 w-3.5" />
            Apply Filter
          </Button>
        </div>
      </div>
    </div>
  );
}
