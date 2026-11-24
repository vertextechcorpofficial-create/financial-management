"use client";

import React from "react";
import { Download, FileSpreadsheet, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useImpairmentReview } from "./hooks/useImpairmentReview";
import StartReviewCard from "./components/StartReviewCard";
import ImpairmentKPICards from "./components/ImpairmentKPICards";
import ExternalIndicatorsSection from "./components/ExternalIndicatorsSection";
import ImpairmentReviewTable from "./components/ImpairmentReviewTable";
import { generateImpairmentReviewPDF } from "./utils/impairmentReviewPdf";

export default function ImpairmentReviewModule() {
  const {
    data,
    isLoading,
    error,
    isStarting,
    isPosting,
    isSigningOff,
    externalIndicators,
    handleExternalIndicatorsChange,
    filteredLines,
    handleStartReview,
    handleUpdateReviewDate,
    handleDiscardReview,
    handleUpdateLine,
    handleToggleObsolete,
    handlePostEntries,
    handleSignOff,
    refresh,
  } = useImpairmentReview();

  const handleExportCSV = () => {
    if (!data?.lines || data.lines.length === 0) {
      toast.info("No data to export");
      return;
    }
    const headers = [
      "Asset Tag",
      "Item Name",
      "Classification",
      "Department",
      "Physical Condition",
      "Carrying Amount",
      "Indicators",
      "Conclusion",
    ];
    const rows = filteredLines.map((l) => [
      `"${l.asset_tag}"`,
      `"${l.item_name.replace(/"/g, '""')}"`,
      `"${l.classification_name}"`,
      `"${l.department_name}"`,
      `"${l.condition_name}"`,
      l.carrying_amount,
      `"${l.indicators.map((i) => i.label).join("; ")}"`,
      `"${l.conclusion_name || "Unconcluded"}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Impairment_Review_${data.review?.review_date || new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV exported successfully");
  };

  const handleExportPDF = async () => {
    if (!data?.lines || data.lines.length === 0) {
      toast.info("No data to export");
      return;
    }
    try {
      toast.loading("Generating PDF report...", { id: "pdf-export" });
      await generateImpairmentReviewPDF({
        reviewTitle: data.review?.review_name || "Impairment Review",
        reviewDate: data.review?.review_date || new Date().toISOString().split("T")[0],
        kpis: data.kpis ?? undefined,
        lines: filteredLines,
      });
      toast.success("PDF exported successfully", { id: "pdf-export" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF", { id: "pdf-export" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading impairment review...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Failed to load impairment review."}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isSignedOff = data.review?.status_id === 2;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto min-h-screen">
      {/* Header, Subtitle & Export Controls */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Impairment review
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            At every reporting date, check all assets for signs of impairment (IAS 36.9). Test the flagged ones, explain the rest, then sign off.
          </p>
        </div>

        {data.hasActiveReview && (
          <div className="flex items-center gap-2">
            {!isSignedOff && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to discard this draft review and return to the Start setup?"
                    )
                  ) {
                    handleDiscardReview();
                  }
                }}
                className="h-8 text-xs gap-1.5 shadow-2xs text-muted-foreground hover:text-destructive"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Discard / Start New
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-8 text-xs gap-1.5 shadow-2xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="h-8 text-xs gap-1.5 shadow-2xs"
            >
              <Download className="h-3.5 w-3.5" /> Export PDF
            </Button>
          </div>
        )}
      </div>

      {/* When NO active review in database, show "START A REVIEW" card (Screenshot 1) */}
      {!data.hasActiveReview ? (
        <StartReviewCard onStart={handleStartReview} isStarting={isStarting} />
      ) : (
        <>
          {/* Top 4 KPI Metric Cards (Screenshot 2) with Change Date feature */}
          {data.kpis && (
            <ImpairmentKPICards
              kpis={data.kpis}
              onUpdateDate={handleUpdateReviewDate}
              isSignedOff={isSignedOff}
            />
          )}

          {/* External Indicators Checkboxes & Controls (Screenshot 2, 3) */}
          <ExternalIndicatorsSection
            state={externalIndicators}
            onChange={handleExternalIndicatorsChange}
            disabled={isSignedOff}
          />

          {/* Main Review Table (Screenshot 2, 3, 4, 5) */}
          <ImpairmentReviewTable
            lines={filteredLines}
            conclusions={data.conclusions}
            onUpdateLine={handleUpdateLine}
            onToggleObsolete={handleToggleObsolete}
            onPostEntries={handlePostEntries}
            onSignOff={handleSignOff}
            isPosting={isPosting}
            isSigningOff={isSigningOff}
            isSignedOff={isSignedOff}
            reviewDate={data.review?.review_date || "Nov 16, 2026"}
          />
        </>
      )}
    </div>
  );
}
