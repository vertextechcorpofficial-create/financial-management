"use client";

import React, { useState } from "react";
import { useStatementOfChangesInEquity } from "../hooks/useStatementOfChangesInEquity";
import { SCEHeader } from "./SCEHeader";
import { SCEReportControlSection } from "./SCEReportControlSection";
import { SCECoverageBanner } from "./SCECoverageBanner";
import { SCESummaryCards } from "./SCESummaryCards";
import { SCEStatementTable } from "./tabs/statement-tab/SCEStatementTable";
import { SCEEquationBanner } from "./tabs/statement-tab/SCEEquationBanner";
import { SCEAccountBreakdownTable } from "./tabs/account-breakdown-tab/SCEAccountBreakdownTable";
import { SCEHistoricalTrendTab } from "./tabs/historical-trend-tab/SCEHistoricalTrendTab";
import { SCEAccountEntriesDrawer } from "./tabs/account-breakdown-tab/SCEAccountEntriesDrawer";
import { SCERollforwardCellModal } from "./tabs/statement-tab/SCERollforwardCellModal";
import { SCESkeletonLoader } from "./SCESkeletonLoader";
import { SCERulesAccordion } from "./SCERulesAccordion";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function StatementOfChangesInEquityContent() {
  const [activeTab, setActiveTab] = useState<"statement" | "accounts" | "trend">("statement");
  const { filters, data, isLoading } = useStatementOfChangesInEquity();

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const filename = `SCE_${filters.viewBy}_${filters.periodLabel.replace(/\s+/g, "_")}_${filters.basis}.csv`;
    alert(`Generating export ${filename}...`);
  };

  if (isLoading && !data) {
    return <SCESkeletonLoader />;
  }

  return (
    <div className="flex flex-col gap-4 pb-12 print:p-0 print:gap-2">
      {/* Formal Printable Document Header (Rendered ONLY when printing) */}
      <div className="hidden print:block border-b-2 border-black pb-3 mb-2 text-black">
        <div className="text-xs uppercase font-bold tracking-wider text-muted-foreground print:text-black">
          {data?.companyName || "MERIDIAN PACIFIC HOLDINGS, INC."}
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-black mt-1">
          Statement of Changes in Equity
        </h1>
        <div className="flex justify-between items-center text-xs mt-1 font-medium">
          <span>{data?.asOfSubtitle || `For the period ended ${filters.endDate}`}</span>
          <span>Amounts in Philippine Peso (₱) · {filters.basis === "restated" ? "Restated (PAS 8)" : "As Reported"}</span>
        </div>
      </div>

      {/* Screen Header & Export Row (Hidden on print) */}
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <SCEHeader />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="h-8 text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Excel (.xlsx)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="h-8 text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* Control Filter Bar (Hidden on print) */}
      <div className="print:hidden">
        <SCEReportControlSection />
      </div>

      {/* Coverage & Basis Banner (Hidden on print) */}
      <div className="print:hidden">
        <SCECoverageBanner />
      </div>

      {/* 4 Summary Cards (Visible on screen and print) */}
      <SCESummaryCards />

      {/* Tab Navigation Pill Bar (Hidden on print) */}
      <div className="flex rounded-md border p-1 bg-muted/40 w-fit print:hidden">
        <Button
          type="button"
          variant={activeTab === "statement" ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs font-medium px-4"
          onClick={() => setActiveTab("statement")}
        >
          Statement
        </Button>
        <Button
          type="button"
          variant={activeTab === "accounts" ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs font-medium px-4"
          onClick={() => setActiveTab("accounts")}
        >
          Account breakdown
        </Button>
        <Button
          type="button"
          variant={activeTab === "trend" ? "default" : "ghost"}
          size="sm"
          className="h-8 text-xs font-medium px-4"
          onClick={() => setActiveTab("trend")}
        >
          Historical trend
        </Button>
      </div>

      {/* Tab Content Display */}
      {activeTab === "statement" && (
        <div className="flex flex-col gap-4">
          <SCEStatementTable />
          <div className="print:hidden">
            <SCEEquationBanner />
          </div>
        </div>
      )}

      {activeTab === "accounts" && (
        <div className="flex flex-col gap-4">
          <SCEAccountBreakdownTable />
        </div>
      )}

      {activeTab === "trend" && (
        <div className="flex flex-col gap-4">
          <SCEHistoricalTrendTab />
        </div>
      )}

      {/* Footer Standards & Business Rules (Hidden on print) */}
      <div className="print:hidden">
        <SCERulesAccordion />
      </div>

      {/* Slide-over Right Drawer for Single Account Entries (Account Breakdown Tab) */}
      <SCEAccountEntriesDrawer />

      {/* Cell Drill-Down Modal for Statement Amounts (Statement Tab) */}
      <SCERollforwardCellModal />
    </div>
  );
}
