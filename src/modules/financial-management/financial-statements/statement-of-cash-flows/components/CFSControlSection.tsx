"use client";

import React from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { CFSViewBy, CFSCompareOption } from "../types";
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
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

export function CFSControlSection() {
  const {
    filters,
    setViewBy,
    setPeriodDate,
    setCompare,
    setCompareOption,
  } = useCashFlowStudio();

  const handlePrevPeriod = () => {
    // Demo step prev
  };

  const handleNextPeriod = () => {
    // Demo step next
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
                variant={filters.viewBy === mode ? "default" : "ghost"}
                size="sm"
                className={`h-8 flex-1 text-xs font-medium ${
                  filters.viewBy === mode ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
                }`}
                onClick={() => setViewBy(mode)}
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>

        {/* FISCAL YEAR / PERIOD PICKER */}
        <div className="flex flex-col gap-1.5 lg:col-span-4">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {filters.viewBy === "Monthly"
              ? "MONTH"
              : filters.viewBy === "Quarterly"
              ? "QUARTER"
              : "FISCAL YEAR"}
          </Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 border-muted"
              onClick={handlePrevPeriod}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Select
              value={filters.periodLabel}
              onValueChange={(val) => setPeriodDate("2026-10-31", val)}
            >
              <SelectTrigger className="h-9 flex-1 bg-background border-muted font-medium text-xs">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {filters.viewBy === "Annually" && (
                  <>
                    <SelectItem value="FY 2026 YTD">FY 2026 YTD</SelectItem>
                    <SelectItem value="FY 2025">FY 2025</SelectItem>
                    <SelectItem value="FY 2024">FY 2024</SelectItem>
                  </>
                )}
                {filters.viewBy === "Quarterly" && (
                  <>
                    <SelectItem value="Q3 2026">Q3 2026</SelectItem>
                    <SelectItem value="Q2 2026">Q2 2026</SelectItem>
                    <SelectItem value="Q1 2026">Q1 2026</SelectItem>
                  </>
                )}
                {filters.viewBy === "Monthly" && (
                  <>
                    <SelectItem value="Sep 2026">Sep 2026</SelectItem>
                    <SelectItem value="Aug 2026">Aug 2026</SelectItem>
                    <SelectItem value="Jul 2026">Jul 2026</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 border-muted"
              onClick={handleNextPeriod}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* DATE RANGE */}
        <div className="flex flex-col gap-1.5 lg:col-span-5">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            DATE RANGE
          </Label>
          <div className="flex h-9 items-center gap-2 rounded-md border border-muted bg-background/50 px-3 text-xs text-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{filters.dateRangeLabel}</span>
          </div>
        </div>
      </div>

      {/* COMPARISON ROW */}
      <div className="flex flex-wrap items-center gap-4 border-t border-muted/50 pt-3">
        <div className="flex items-center gap-2">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            COMPARISON
          </Label>
          <div className="flex items-center gap-2">
            <Switch
              id="cfs-compare-toggle"
              checked={filters.compare}
              onCheckedChange={setCompare}
            />
            <Label htmlFor="cfs-compare-toggle" className="text-xs font-semibold cursor-pointer">
              Compare
            </Label>
          </div>
        </div>

        {filters.compare && (
          <div className="flex items-center gap-2 animate-in fade-in duration-200">
            <Select
              value={filters.compareOption}
              onValueChange={(val) => setCompareOption(val as CFSCompareOption)}
            >
              <SelectTrigger className="h-8 w-[230px] bg-background border-muted text-xs font-medium">
                <SelectValue placeholder="Compare with..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="previous_year">
                  Previous year ({filters.viewBy === "Annually" ? "FY 2025 YTD" : "Same period last year"})
                </SelectItem>
                <SelectItem value="previous_period">
                  Previous period ({filters.viewBy === "Annually" ? "FY 2025" : "Prior month/quarter"})
                </SelectItem>
                <SelectItem value="custom">Custom period</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
