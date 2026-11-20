"use client";

import React from "react";
import { useStatementOfChangesInEquity } from "../hooks/useStatementOfChangesInEquity";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function SCECoverageBanner() {
  const { filters, setDivision, setDepartment, setBasis, data, isLoading } = useStatementOfChangesInEquity();

  const divisionOptions = [
    { value: "all", label: "All Divisions" },
    { value: "corporate", label: "Head Office / Corporate" },
    { value: "mfg", label: "Manufacturing" },
    { value: "dist", label: "Distribution" },
    { value: "intl", label: "International (SG)" },
  ];

  const departmentOptions = [
    { value: "all", label: "All Departments" },
    { value: "finance", label: "Finance & Accounting" },
    { value: "ops", label: "Operations" },
    { value: "sales", label: "Sales & Marketing" },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-xs shadow-sm sm:p-4">
      {/* Top Banner Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">Report coverage:</span>{" "}
            {filters.startDate} – {filters.endDate}
          </div>
          <div className="hidden sm:inline text-muted-foreground/40">|</div>
          <div>
            <span className="font-semibold text-foreground">Status:</span>{" "}
            {isLoading ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating ledger activity...
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                Posted ledger activity
              </span>
            )}
          </div>
        </div>

        {/* Division & Department Searchable Selects */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <SearchableSelect
              options={divisionOptions}
              value={filters.divisionId}
              disabled={isLoading}
              onValueChange={setDivision}
              placeholder="Select Division"
              className="h-8 text-xs"
            />
          </div>
          <div className="w-44">
            <SearchableSelect
              options={departmentOptions}
              value={filters.departmentId}
              disabled={isLoading}
              onValueChange={setDepartment}
              placeholder="Select Department"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Sub-banner: Metadata & Basis Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-muted-foreground">
        <div>
          Report updated. Last updated {data?.lastUpdated || "Nov 19, 2026, 8:20 AM"} · ledger posted through{" "}
          <span className="font-medium text-foreground">{data?.ledgerPostedThrough || "Oct 31, 2026"}</span>
        </div>

        {/* Prior-period basis toggle */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Prior-period basis:</span>
          <div className="flex rounded-md border p-0.5 bg-muted/40">
            <Button
              type="button"
              variant={filters.basis === "restated" ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[11px] font-medium"
              disabled={isLoading}
              onClick={() => setBasis("restated")}
            >
              Restated (PAS 8)
            </Button>
            <Button
              type="button"
              variant={filters.basis === "reported" ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[11px] font-medium"
              disabled={isLoading}
              onClick={() => setBasis("reported")}
            >
              As previously reported
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
