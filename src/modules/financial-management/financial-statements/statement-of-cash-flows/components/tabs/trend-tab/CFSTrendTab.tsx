"use client";

import React from "react";
import { CFSWaterfallChart } from "./CFSWaterfallChart";
import { CFSRatioCardItem } from "./CFSRatioCardItem";
import { CFSMultiPeriodTrend } from "./CFSMultiPeriodTrend";

export function CFSTrendTab() {
  const ratioCardsData = [
    {
      title: "Cash conversion",
      value: "2.34×",
      changeValue: "0.73×",
      changeDirection: "up" as const,
      changeIsPositiveForBusiness: true,
      comparisonPeriod: "vs Aug 2026 (1.61×)",
      status: "Strong" as const,
      sparklinePoints: [1.2, 1.4, 1.3, 1.7, 1.5, 1.9, 1.6, 1.8, 1.61, 2.34],
      dateStart: "Oct 2024",
      dateEnd: "Sep 2026",
      mainMeaning: "Profit fully backed by cash",
      formula: "Operating cash flow ÷ profit for the period",
    },
    {
      title: "Operating cash flow ratio",
      value: "0.76×",
      changeValue: "0.18×",
      changeDirection: "up" as const,
      changeIsPositiveForBusiness: true,
      comparisonPeriod: "vs Aug 2026 (0.58×)",
      status: "Watch" as const,
      sparklinePoints: [0.65, 0.72, 0.6, 0.45, 0.48, 0.62, 0.4, 0.42, 0.58, 0.76],
      dateStart: "Oct 2024",
      dateEnd: "Sep 2026",
      mainMeaning: "Partly covers current liabilities",
      formula: "Operating cash flow (annualised) ÷ current liabilities · annualised",
    },
    {
      title: "Capital expenditure coverage",
      value: "2.06×",
      changeValue: "0.79×",
      changeDirection: "up" as const,
      changeIsPositiveForBusiness: true,
      comparisonPeriod: "vs Aug 2026 (1.28×)",
      status: "Strong" as const,
      sparklinePoints: [1.1, 1.3, 0.9, 1.4, 1.2, 1.6, 1.1, 1.2, 1.28, 2.06],
      dateStart: "Oct 2024",
      dateEnd: "Sep 2026",
      mainMeaning: "Capex funded from operations",
      formula: "Operating cash flow ÷ purchases of PPE",
    },
    {
      title: "Cash interest coverage",
      value: "8.62×",
      changeValue: "2.80×",
      changeDirection: "up" as const,
      changeIsPositiveForBusiness: true,
      comparisonPeriod: "vs Aug 2026 (5.82×)",
      status: "Strong" as const,
      sparklinePoints: [5.2, 5.8, 4.9, 6.4, 5.1, 7.2, 5.3, 5.6, 5.82, 8.62],
      dateStart: "Oct 2024",
      dateEnd: "Sep 2026",
      mainMeaning: "Comfortable",
      formula: "(Operating cash flow + interest paid + taxes paid) ÷ interest paid",
    },
    {
      title: "Debt payback",
      value: "2.3 yrs",
      changeValue: "0.8 yrs",
      changeDirection: "down" as const,
      changeIsPositiveForBusiness: true, // fewer years to repay debt is better
      comparisonPeriod: "vs Aug 2026 (3.0 yrs)",
      status: "Strong" as const,
      sparklinePoints: [3.4, 3.2, 3.8, 2.9, 3.6, 2.8, 3.5, 3.3, 3.0, 2.3],
      dateStart: "Oct 2024",
      dateEnd: "Sep 2026",
      mainMeaning: "Within 3 years",
      formula: "Borrowings ÷ operating cash flow (annualised) · annualised",
    },
    {
      title: "Free cash flow",
      value: "₱427,000.00",
      changeValue: "₱296,000.00",
      changeDirection: "up" as const,
      changeIsPositiveForBusiness: true,
      comparisonPeriod: "vs Aug 2026 (₱131,000.00)",
      status: "Strong" as const,
      sparklinePoints: [180000, 240000, 90000, 150000, 110000, 210000, 80000, 120000, 131000, 427000],
      dateStart: "Oct 2024",
      dateEnd: "Sep 2026",
      mainMeaning: "Cash left after investment",
      formula: "Operating cash flow − purchases of PPE",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Waterfall Chart */}
      <CFSWaterfallChart />

      {/* 2. Cash Flow Ratios Section */}
      <div>
        <div className="flex flex-wrap items-center justify-between pb-3">
          <h3 className="text-sm font-bold text-foreground">Cash flow ratios</h3>
          <span className="text-xs text-muted-foreground">
            Analysis only — not part of the financial statements
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ratioCardsData.map((ratio) => (
            <CFSRatioCardItem key={ratio.title} {...ratio} />
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          Strong / Watch / Weak use indicative rules of thumb (set in the page code) — adjust them to your own targets. Sparklines follow the selected view (monthly, quarterly or annual), annualised where needed.
        </p>
      </div>

      {/* 3. Monthly Multi-Period Trend Chart & Table */}
      <CFSMultiPeriodTrend />
    </div>
  );
}
