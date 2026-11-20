"use client";

import React from "react";
import { useStatementOfChangesInEquity } from "../hooks/useStatementOfChangesInEquity";

export function SCEHeader() {
  const { data, filters } = useStatementOfChangesInEquity();

  const company = data?.companyName || "Meridian Pacific Holdings, Inc.";
  const subtitle = data?.asOfSubtitle || `For the month ended ${filters.endDate}`;
  const isRestated = filters.basis === "restated";

  return (
    <div className="flex flex-col gap-1 pb-1">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        FINANCIAL STATEMENTS · {company}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Statement of Changes in Equity
        </h1>
        {isRestated && (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300">
            As restated (PAS 8)
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {subtitle}
      </p>
    </div>
  );
}
