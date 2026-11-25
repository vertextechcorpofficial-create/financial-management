"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { useAssetDashboard } from "./hooks/useAssetDashboard";
import DashboardKPICards from "./components/DashboardKPICards";
import CarryingAmountByClass from "./components/CarryingAmountByClass";
import ComplianceReviewAlerts from "./components/ComplianceReviewAlerts";
import RecentAccountingEventsTable from "./components/RecentAccountingEventsTable";

export default function AssetDashboardModule() {
  const { data, isLoading, error } = useAssetDashboard();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a2b]" />
        <p className="text-xs text-muted-foreground">Loading asset metrics & alerts...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Failed to load dashboard."}</p>
        </div>
      </div>
    );
  }

  const { metrics, carryingByClass, complianceAlerts, recentEvents } = data;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto bg-[#faf8f5]/40 min-h-screen">
      {/* Title & PFRS Position Subtitle */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-serif font-black tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Position as at {data.asOfDate} · {data.standard} · {data.currency}
        </p>
      </div>

      {/* Top 6 KPI Metric Cards */}
      <DashboardKPICards metrics={metrics} />

      {/* Middle Row: Carrying Amount by Class + Compliance & Review Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <CarryingAmountByClass data={carryingByClass} />
        </div>
        <div className="lg:col-span-7">
          <ComplianceReviewAlerts alerts={complianceAlerts} />
        </div>
      </div>

      {/* Bottom Table: Recent Accounting Events */}
      <RecentAccountingEventsTable events={recentEvents} />
    </div>
  );
}
