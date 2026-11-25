"use client";

import React from "react";
import { Download, FileSpreadsheet, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAssetSummary } from "./hooks/useAssetSummary";
import AssetSummaryKPICards from "./components/AssetSummaryKPICards";
import AssetSummaryTable from "./components/AssetSummaryTable";

export default function AssetSummaryModule() {
  const {
    data,
    filteredGroups,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    groupBy,
    setGroupBy,
    refresh,
  } = useAssetSummary("item_name");

  const handleExportCSV = () => {
    if (!data || data.groups.length === 0) {
      toast.info("No data to export");
      return;
    }
    const headers = [
      "Item Name",
      "Item Type",
      "Classification",
      "In Use",
      "Out",
      "By Department",
      "By Condition",
      "Total Cost",
      "Accum Dep",
      "Projected Value",
    ];
    const rows = data.groups.map((g) => [
      `"${g.itemName.replace(/"/g, '""')}"`,
      `"${g.itemType.replace(/"/g, '""')}"`,
      `"${g.classification.replace(/"/g, '""')}"`,
      g.inUseCount,
      g.outCount,
      `"${g.byDepartmentText.replace(/"/g, '""')}"`,
      `"${g.byConditionText.replace(/"/g, '""')}"`,
      g.totalCost,
      g.accumDepAndImp,
      g.projectedValue,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Asset_Summary_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV exported successfully");
  };

  const handleExportPDF = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading asset summary...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Failed to load asset summary."}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const groupLabel =
    groupBy === "classification"
      ? "CLASSIFICATION GROUPS"
      : groupBy === "item_type"
      ? "ITEM TYPE GROUPS"
      : groupBy === "department"
      ? "DEPARTMENT GROUPS"
      : "ITEM NAME GROUPS";

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto min-h-screen">
      {/* Header & Subtitle & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Asset summary
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Each RFID-tagged unit is one record &mdash; this view consolidates them so you can see how many of each item you hold. Values as at {data.asOfDate}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="h-9 text-xs gap-1.5 shadow-2xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="h-9 text-xs gap-1.5 shadow-2xs"
          >
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filter Toolbar: Search + Group By */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items, tags, departments, serials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground font-medium whitespace-nowrap">Group by</span>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="w-44 h-9 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="item_name">Item name</SelectItem>
              <SelectItem value="item_type">Item type</SelectItem>
              <SelectItem value="classification">Classification</SelectItem>
              <SelectItem value="department">Department</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Top 4 KPI Metric Cards */}
      <AssetSummaryKPICards kpis={data.kpis} groupLabel={groupLabel} />

      {/* Main Consolidated Table with Collapsible Child Units */}
      <AssetSummaryTable
        groups={filteredGroups}
        totalInUse={data.totalUnitsInUse}
        totalOut={data.totalUnitsOut}
        totalCost={data.totalCost}
        totalAccumDep={data.totalAccumDep}
        totalProjectedValue={data.totalProjectedValue}
      />
    </div>
  );
}
