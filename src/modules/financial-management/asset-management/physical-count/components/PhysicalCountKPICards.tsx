"use client";

import React from "react";
import { format } from "date-fns";
import type { PhysicalCountOverviewData } from "../types";

interface PhysicalCountKPICardsProps {
  data: PhysicalCountOverviewData | null;
}

export default function PhysicalCountKPICards({
  data,
}: PhysicalCountKPICardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="p-4 rounded-xl border bg-card">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
          Count sessions
        </span>
        <span className="text-xl font-bold font-mono text-foreground mt-1.5 block">
          {data?.totalSessions ?? 0}
        </span>
      </div>

      <div className="p-4 rounded-xl border bg-card">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
          In progress
        </span>
        <span className="text-xl font-bold font-mono text-foreground mt-1.5 block">
          {data?.inProgressCount ?? 0}
        </span>
      </div>

      <div className="p-4 rounded-xl border bg-card">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
          Last completed
        </span>
        <span className="text-sm font-semibold text-foreground mt-2 block">
          {data?.lastCompletedDate
            ? format(new Date(data.lastCompletedDate), "MMM dd, yyyy")
            : "—"}
        </span>
      </div>

      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
          Not verified in 12 months
        </span>
        <span className="text-xl font-bold font-mono text-amber-900 dark:text-amber-200 mt-1.5 block">
          {data?.notVerifiedCount ?? 0} assets
        </span>
      </div>
    </div>
  );
}
