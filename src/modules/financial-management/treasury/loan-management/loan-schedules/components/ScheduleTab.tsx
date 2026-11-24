"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { LoanDirectory } from "./LoanDirectory";
import { LoanView } from "./LoanView";
import type { useSchedules } from "../hooks/useSchedules";

/**
 * Tab 1, two levels: the directory the page opens on, and one loan's schedule once a row is opened.
 * The level lives in the hook's `loanId` filter, so opening a loan and going back are the same
 * one read the screen already knows how to make.
 */
export function ScheduleTab({ schedules }: { schedules: ReturnType<typeof useSchedules> }) {
  const { data, filters, isLoading, updateFilters } = schedules;

  if (isLoading && data.loans.length === 0) {
    return (
      <div className="space-y-2 rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (filters.loanId === null) {
    return (
      <LoanDirectory
        loans={data.loans}
        asOf={data.asOf}
        onOpen={(loanId) => updateFilters({ loanId, version: null, status: "ALL", dueFrom: "", dueTo: "" })}
      />
    );
  }

  return (
    <LoanView
      schedules={schedules}
      onBack={() => updateFilters({ loanId: null, status: "ALL", dueFrom: "", dueTo: "" })}
    />
  );
}
