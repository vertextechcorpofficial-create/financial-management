"use client";

import React, { useState } from "react";
import { CashFlowStudioProvider, useCashFlowStudio } from "./providers/CashFlowStudioProvider";
import { CFSHeader } from "./components/CFSHeader";
import { CFSControlSection } from "./components/CFSControlSection";
import { CFSCoverageStrip } from "./components/CFSCoverageStrip";
import { CFSSummaryCards } from "./components/CFSSummaryCards";
import { CFSReviewChecks } from "./components/CFSReviewChecks";
import { CFSStatementTable } from "./components/tabs/statement-tab/CFSStatementTable";
import { CFSTrendTab } from "./components/tabs/trend-tab/CFSTrendTab";
import { CFSFinancingLiabilitiesTab } from "./components/tabs/liabilities-tab/CFSFinancingLiabilitiesTab";
import { CFSAccountMappingTab } from "./components/tabs/mapping-tab/CFSAccountMappingTab";
import { CFSAuditTrailDrawer } from "./components/CFSAuditTrailDrawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

function CashFlowStudioInner() {
  const [activeTab, setActiveTab] = useState<"statement" | "trend" | "liabilities" | "mapping">("statement");
  const { data } = useCashFlowStudio();

  const unmappedCount = data.unmappedAccounts.length;

  const scrollToSection = (sectionId: string) => {
    setActiveTab("statement");
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("bg-primary/10");
        setTimeout(() => el.classList.remove("bg-primary/10"), 2000);
      }
    }, 100);
  };

  return (
    <div className="flex flex-col gap-5 pb-16 print:p-0 print:gap-0">
      {/* 1. Header with Entity Picker (Hidden on print) */}
      <div className="print:hidden">
        <CFSHeader />
      </div>

      {/* 2. Filter card with Period & Comparison Switch (Hidden on print) */}
      <div className="print:hidden">
        <CFSControlSection />
      </div>

      {/* 3. Coverage strip & Status (Hidden on print) */}
      <div className="print:hidden">
        <CFSCoverageStrip />
      </div>

      {/* 4. 4 Summary KPI Cards (Hidden on print) */}
      <div className="print:hidden">
        <CFSSummaryCards onScrollToSection={scrollToSection} />
      </div>

      {/* 5. Tabs Container */}
      <div className="print:hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "statement" | "trend" | "liabilities" | "mapping")} className="w-full">
          <TabsList className="bg-muted/40 p-1 border">
            <TabsTrigger value="statement" className="text-xs font-semibold">
              Statement
            </TabsTrigger>
            <TabsTrigger value="trend" className="text-xs font-semibold">
              Cash movement & trend
            </TabsTrigger>
            <TabsTrigger value="liabilities" className="text-xs font-semibold">
              Financing liabilities
            </TabsTrigger>
            <TabsTrigger value="mapping" className="text-xs font-semibold flex items-center gap-1.5">
              Account mapping
              {unmappedCount > 0 && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px] font-bold">
                  {unmappedCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* 6. Review Checks Accordion */}
          <div className="my-4">
            <CFSReviewChecks />
          </div>

          {/* TAB 1: Statement */}
          <TabsContent value="statement" className="mt-0">
            <CFSStatementTable />
          </TabsContent>

          {/* TAB 2: Trend & Ratios */}
          <TabsContent value="trend" className="mt-0">
            <CFSTrendTab />
          </TabsContent>

          {/* TAB 3: Financing Liabilities */}
          <TabsContent value="liabilities" className="mt-0">
            <CFSFinancingLiabilitiesTab />
          </TabsContent>

          {/* TAB 4: Account Mapping */}
          <TabsContent value="mapping" className="mt-0">
            <CFSAccountMappingTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* PRINT-ONLY VIEW: Always renders the formal Statement of Cash Flows */}
      <div className="hidden print:block w-full">
        <CFSStatementTable />
      </div>

      {/* 5-Level / 3-Tier Audit Trail Drawer (Hidden on print) */}
      <div className="print:hidden">
        <CFSAuditTrailDrawer />
      </div>
    </div>
  );
}

export function CashFlowStatementModule() {
  return (
    <CashFlowStudioProvider>
      <CashFlowStudioInner />
    </CashFlowStudioProvider>
  );
}

export default CashFlowStatementModule;
