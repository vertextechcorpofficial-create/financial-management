"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { usePeriodClosing } from "./hooks/usePeriodClosing";
import PeriodCloseKPICards from "./components/PeriodCloseKPICards";
import PeriodCloseSection from "./components/PeriodCloseSection";
import DepreciationPostingTable from "./components/DepreciationPostingTable";

export default function PeriodClosingModule() {
  const {
    data,
    isLoading,
    error,
    selectedPostingYm,
    selectedReopenYm,
    setSelectedReopenYm,
    selectedCloseTarget,
    setSelectedCloseTarget,
    reopenReason,
    setReopenReason,
    yearEndConfirmed,
    setYearEndConfirmed,
    isSubmitting,
    handleSelectMonth,
    handleClose,
    handleReopen,
  } = usePeriodClosing();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading period closing records...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Failed to load period close data."}</p>
        </div>
      </div>
    );
  }

  const postingRows = data.postingDetails[selectedPostingYm] || [];
  const selectedPostingMonth = data.months.find((m) => m.ym === selectedPostingYm);
  const postingYmLabel = selectedPostingMonth?.label || selectedPostingYm;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-[1400px] mx-auto min-h-screen">
      {/* Page Title & Subtitle */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Period close
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Closing a period posts its depreciation and locks it: no edits to accounting data, events or
          acquisitions dated in a closed month.
        </p>
      </div>

      {/* Top 4 KPI Cards */}
      <PeriodCloseKPICards data={data} />

      {/* Main Section: Close Period Control & Months Table */}
      <PeriodCloseSection
        data={data}
        selectedCloseTarget={selectedCloseTarget}
        onSelectCloseTarget={setSelectedCloseTarget}
        selectedPostingYm={selectedPostingYm}
        selectedReopenYm={selectedReopenYm}
        onSelectReopenYm={setSelectedReopenYm}
        onSelectMonth={handleSelectMonth}
        reopenReason={reopenReason}
        onReopenReasonChange={setReopenReason}
        yearEndConfirmed={yearEndConfirmed}
        onYearEndConfirmedChange={setYearEndConfirmed}
        isSubmitting={isSubmitting}
        onClose={handleClose}
        onReopen={handleReopen}
      />

      {/* Bottom Section: Depreciation Posting Journal Entry */}
      <DepreciationPostingTable
        postingYmLabel={postingYmLabel}
        rows={postingRows}
      />
    </div>
  );
}
