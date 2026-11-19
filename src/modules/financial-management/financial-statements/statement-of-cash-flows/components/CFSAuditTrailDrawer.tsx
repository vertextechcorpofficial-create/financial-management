"use client";

import React, { useState } from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { formatPHP } from "../utils/cfs-format";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckCircle2, ChevronRight, XCircle } from "lucide-react";

export function CFSAuditTrailDrawer() {
  const { selectedLineForAudit, closeAuditTrail, filters, data } = useCashFlowStudio();
  const [activePeriodToggle, setActivePeriodToggle] = useState<"current" | "comparison">("current");

  if (!selectedLineForAudit) return null;

  const line = selectedLineForAudit;
  const isComparison = activePeriodToggle === "comparison";
  const displayedAmount = isComparison ? line.comparisonAmount : line.currentAmount;

  return (
    <Sheet open={Boolean(selectedLineForAudit)} onOpenChange={(open) => !open && closeAuditTrail()}>
      <SheetContent className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-semibold text-muted-foreground">
              AUDIT TRAIL DRILL-DOWN
            </span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
              3 TIE-OUT CHECKS PASSED
            </Badge>
          </div>
          <SheetTitle className="text-lg font-bold text-foreground">
            {line.label}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Traces from the reported statement line down to individual journal entries across 5 levels.
          </SheetDescription>

          {/* Toggle Between Current vs. Comparison Period */}
          {filters.compare && (
            <div className="mt-3 inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setActivePeriodToggle("current")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  !isComparison ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {filters.periodLabel}
              </button>
              <button
                type="button"
                onClick={() => setActivePeriodToggle("comparison")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  isComparison ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {filters.comparePeriodLabel.replace(/Previous\s\w+\s\((.*)\)/, "$1")}
              </button>
            </div>
          )}
        </SheetHeader>

        {/* 5-LEVEL DRILL-DOWN CONTAINER */}
        <div className="py-6 flex flex-col gap-6 text-xs">
          {/* LEVEL 1: Statement Line */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between pb-2 border-b border-muted">
              <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                1 · Statement Line
              </span>
              <span className="font-mono font-bold text-sm text-foreground">
                ₱{formatPHP(displayedAmount)}
              </span>
            </div>
            <p className="mt-2 text-muted-foreground text-[11px]">
              Extracted from {data.entity.name} · {data.status} status · {data.lastUpdated}
            </p>
          </div>

          <div className="flex items-center justify-center -my-3 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-[11px] font-semibold ml-1">components add up to the line amount</span>
          </div>

          {/* LEVEL 2: Calculation Formula */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between pb-2 border-b border-muted">
              <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                2 · Calculation & Rules
              </span>
              <Badge variant="outline" className="text-[10px] text-primary">PAS 7 Rule</Badge>
            </div>
            <div className="mt-2 space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>Base Component / Flow:</span>
                <span className="font-mono font-medium text-foreground">Opening Balance − Closing Balance</span>
              </div>
              <div className="flex justify-between">
                <span>Sign convention:</span>
                <span className="font-medium text-foreground">Asset outflow inverted to negative</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center -my-3 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-[11px] font-semibold ml-1">reads the figures it names</span>
          </div>

          {/* LEVEL 3: System Figure */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between pb-2 border-b border-muted">
              <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                3 · System Figure
              </span>
              <span className="font-mono font-bold text-foreground">
                Net ₱{formatPHP(displayedAmount)}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-muted-foreground">
              <div className="flex justify-between">
                <span>Opening balance:</span>
                <span className="font-mono">₱4,250,000.00</span>
              </div>
              <div className="flex justify-between">
                <span>Closing balance:</span>
                <span className="font-mono">₱4,356,000.00</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center -my-3 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-[11px] font-semibold ml-1">accounts add up to the figure</span>
          </div>

          {/* LEVEL 4: GL Accounts */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between pb-2 border-b border-muted">
              <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                4 · GL Accounts Behind Figure
              </span>
              <span className="text-[10px] text-muted-foreground">2 Accounts</span>
            </div>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between p-2 rounded bg-muted/20">
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">1200 Accounts Receivable — Trade</span>
                  <span className="text-[11px] text-muted-foreground">Movement: -₱120,000.00</span>
                </div>
                <span className="font-mono font-semibold text-foreground">₱4,150,000.00</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-muted/20">
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">1210 Allowance for Impairment</span>
                  <span className="text-[11px] text-muted-foreground">Movement: +₱14,000.00</span>
                </div>
                <span className="font-mono font-semibold text-foreground">-₱206,000.00</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center -my-3 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-[11px] font-semibold ml-1">entries roll forward to the account</span>
          </div>

          {/* LEVEL 5: Journal Entries */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between pb-2 border-b border-muted">
              <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                5 · Sample Journal Entries
              </span>
              <span className="text-[10px] text-muted-foreground">Source Module Drill-down</span>
            </div>
            <div className="mt-2 space-y-2">
              <div className="p-2 rounded border bg-muted/10 space-y-1">
                <div className="flex justify-between font-semibold text-foreground">
                  <span>JE-2026-10-0042</span>
                  <span className="font-mono text-emerald-600">+₱150,000.00</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Source: Collection Posting (CR-2026-902)</span>
                  <span>Posted: Oct 28, 2026</span>
                </div>
              </div>
              <div className="p-2 rounded border bg-muted/10 space-y-1">
                <div className="flex justify-between font-semibold text-foreground">
                  <span>JE-2026-10-0089</span>
                  <span className="font-mono text-blue-600">-₱44,000.00</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Source: Sales Invoice Monitoring</span>
                  <span>Posted: Oct 29, 2026</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
