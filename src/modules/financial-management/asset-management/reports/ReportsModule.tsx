"use client";

import React, { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAssetReports } from "./hooks/useAssetReports";
import { SearchableSelect } from "./components/SearchableSelect";
import AssetRegisterTab from "./components/AssetRegisterTab";
import PpeMovementTab from "./components/PpeMovementTab";
import FsImpactTab from "./components/FsImpactTab";
import DepreciationByDeptTab from "./components/DepreciationByDeptTab";
import DepreciationForecastTab from "./components/DepreciationForecastTab";
import MaintenanceLogTab from "./components/MaintenanceLogTab";
import ActivityLogTab from "./components/ActivityLogTab";
import PdfPreviewModal from "./components/PdfPreviewModal";
import { exportReportCSV } from "./utils/exportReports";
import type { ReportTabKey } from "./types";

const REPORT_TABS: { key: ReportTabKey; label: string }[] = [
  { key: "register", label: "Asset register" },
  { key: "rollforward", label: "PPE movement schedule" },
  { key: "pl", label: "Financial statement impact" },
  { key: "deptdep", label: "Depreciation by department" },
  { key: "forecast", label: "Depreciation forecast" },
  { key: "maint", label: "Maintenance log" },
  { key: "activity", label: "Activity log" },
];

export default function ReportsModule() {
  const {
    data,
    isLoading,
    error,
    activeTab,
    setActiveTab,
    selectedYear,
    handleYearChange,
    activitySearch,
    setActivitySearch,
    activityUser,
    setActivityUser,
    activityAction,
    setActivityAction,
    filteredActivityRows,
    refresh,
  } = useAssetReports();

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  const needsYear =
    activeTab === "rollforward" || activeTab === "pl" || activeTab === "deptdep";

  const handleExportCSV = () => {
    if (!data) return;
    try {
      exportReportCSV(activeTab, data, filteredActivityRows);
      toast.success("CSV exported successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export CSV");
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading asset reports...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Failed to load asset reports."}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const yearOptions = data.availableYears.map((y) => ({ label: y, value: y }));

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1440px] mx-auto min-h-screen">
      {/* Page Title, Subtitle & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Every report exports to CSV (opens in Excel) or PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {needsYear && (
            <div className="flex items-center gap-2 mr-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Financial year
              </span>
              <div className="w-24">
                <SearchableSelect
                  options={yearOptions}
                  value={selectedYear}
                  onChange={handleYearChange}
                  placeholder="Year"
                  searchPlaceholder="Search year..."
                  className="h-8"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-8 text-xs gap-1.5 shadow-2xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPdfPreviewOpen(true)}
            className="h-8 text-xs gap-1.5 shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* 7 Report Tabs — Pill buttons following system theme primary color */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ReportTabKey)}
        className="space-y-4"
      >
        <div className="bg-card border rounded-2xl p-2 shadow-2xs overflow-x-auto">
          <TabsList className="bg-transparent h-auto p-0 flex flex-nowrap sm:flex-wrap items-center gap-2 justify-start w-max sm:w-full">
            {REPORT_TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-medium text-muted-foreground shadow-2xs transition-all hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:shadow-sm whitespace-nowrap"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="register" className="mt-0">
          <AssetRegisterTab report={data.assetRegister} />
        </TabsContent>

        <TabsContent value="rollforward" className="mt-0">
          <PpeMovementTab report={data.ppeMovement} />
        </TabsContent>

        <TabsContent value="pl" className="mt-0">
          <FsImpactTab report={data.fsImpact} />
        </TabsContent>

        <TabsContent value="deptdep" className="mt-0">
          <DepreciationByDeptTab report={data.depreciationByDept} />
        </TabsContent>

        <TabsContent value="forecast" className="mt-0">
          <DepreciationForecastTab report={data.depreciationForecast} />
        </TabsContent>

        <TabsContent value="maint" className="mt-0">
          <MaintenanceLogTab report={data.maintenanceLog} />
        </TabsContent>

        <TabsContent value="activity" className="mt-0">
          <ActivityLogTab
            rows={filteredActivityRows}
            users={data.activityLog.users}
            actions={data.activityLog.actions}
            search={activitySearch}
            onSearchChange={setActivitySearch}
            selectedUser={activityUser}
            onUserChange={setActivityUser}
            selectedAction={activityAction}
            onActionChange={setActivityAction}
          />
        </TabsContent>
      </Tabs>

      {/* PDF Preview Modal with PDF Layout Template header */}
      <PdfPreviewModal
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        activeTab={activeTab}
        data={data}
        filteredActivityRows={filteredActivityRows}
      />
    </div>
  );
}
