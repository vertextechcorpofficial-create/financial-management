"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApprovals } from "./hooks/useApprovals";
import ApprovalsKPICards from "./components/ApprovalsKPICards";
import WaitingApprovalsTable from "./components/WaitingApprovalsTable";
import RecentlyDecidedTable from "./components/RecentlyDecidedTable";

export default function ApprovalsModule() {
  const { data, isLoading, error, processingId, handleApprove, handleReject, refresh } =
    useApprovals();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading approvals...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Failed to load approvals."}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto min-h-screen">
      {/* Header & Subtitle */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Approvals
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Entries that need a second person before they post. The person who entered it cannot approve it.
        </p>
      </div>

      {/* KPI Metric Cards */}
      <ApprovalsKPICards kpis={data.kpis} />

      {/* Waiting for approval table */}
      <WaitingApprovalsTable
        items={data.waitingApprovals}
        onApprove={handleApprove}
        onReject={handleReject}
        processingId={processingId}
      />

      {/* Recently decided table */}
      <RecentlyDecidedTable items={data.recentlyDecided} />

      {/* Footnote note */}
      <p className="text-[11px] text-muted-foreground">
        Pending entries do not affect any figure until approved. A period cannot be closed while entries dated in it are still pending. Thresholds are set in Settings.
      </p>
    </div>
  );
}
