"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { ACCENT } from "./constants";
import { LoanDetailDialog } from "./components/LoanDetailDialog";
import { fetchLoanSchedule, refreshStatuses, type LoanSchedulePreview } from "./providers/registerApi";
import { NewLoanDialog } from "./components/NewLoanDialog";
import { Notice } from "./components/Notice";
import { RegisterFilters } from "./components/RegisterFilters";
import { RegisterKpis } from "./components/RegisterKpis";
import { RegisterTable } from "./components/RegisterTable";
import { TablePager, pageCountFor } from "./components/TablePager";
import { useRegister } from "./hooks/useRegister";
import type { LoanListRow } from "./types";

export function LoanRegisterModule() {
  const register = useRegister();
  const [detail, setDetail] = useState<LoanListRow | null>(null);
  const [schedule, setSchedule] = useState<LoanSchedulePreview | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  // QA 5: the dialog shows the first page of installments; this flag asks for the whole version.
  const [scheduleAll, setScheduleAll] = useState(false);

  function loadSchedule(loanId: number, all: boolean) {
    setScheduleAll(all);
    setSchedule(null);
    setScheduleError(null);
    fetchLoanSchedule(loanId, all ? 400 : 12)
      .then(setSchedule)
      .catch((error: unknown) =>
        setScheduleError(error instanceof Error ? error.message : "The installments could not be read."),
      );
  }
  const [isNewOpen, setNewOpen] = useState(false);
  const [isRefreshing, setRefreshing] = useState(false);

  const accounts = register.summary?.accounts ?? [];
  const { q, status, lenderType } = register.filters;
  const isFiltered = q.length > 0 || status !== "ALL" || lenderType !== "ALL";
  const pageCount = pageCountFor(register.total, register.pageSize);
  const staleOverdue = register.summary?.staleOverdue ?? 0;

  async function runRefresh() {
    setRefreshing(true);
    try {
      const result = await refreshStatuses();
      // The loan sentence first: it is what the register and its Overdue filter show. The
      // installment counts only speak when no loan moved.
      const parts: string[] = [];
      if (result.loansOverdue > 0) parts.push(`${result.loansOverdue} loans moved to overdue`);
      if (result.loansCurrent > 0) parts.push(`${result.loansCurrent} loans moved back to current`);
      if (parts.length === 0 && result.markedOverdue > 0) {
        parts.push(`${result.markedOverdue} installments moved to overdue`);
      }
      if (parts.length === 0 && result.markedDue > 0) {
        parts.push(`${result.markedDue} installments moved to due`);
      }
      toast.success(parts.length > 0 ? `${parts.join(", ")}.` : "No loan changed status.");
      await register.reload();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The statuses could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Loan Register</h1>
          <p className="text-sm text-muted-foreground">
            Every borrowing, its schedule, its effective rate and what is still owed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="min-h-11 md:min-h-0">
            <Link href="/fm/treasury/loan-management/loan-register/reconciliation">Reconciliation</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 md:min-h-0">
            <Link href="/fm/treasury/loan-management/loan-register/settings">
              <Settings className="mr-2 h-4 w-4" aria-hidden />
              Settings
            </Link>
          </Button>
          <Button
            variant="outline"
            className="min-h-11 md:min-h-0"
            onClick={() => void runRefresh()}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh statuses
          </Button>
          <Button
            className="min-h-11 md:min-h-0"
            onClick={() => {
              if (accounts.length === 0) {
                toast.error("Set up a payment account before recording a loan.");
                return;
              }
              setNewOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            New loan
          </Button>
        </div>
      </div>

      {register.error ? (
        <Notice tone="danger" title="The register could not be read.">
          {register.error}
        </Notice>
      ) : null}

      {register.summary ? <RegisterKpis summary={register.summary} pending={register.isLoading && register.total === 0} /> : null}

      <Card className={`overflow-hidden border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Loans</h2>
            <p className="text-xs text-muted-foreground">
              Click a row for the terms, the money and the dates behind it.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {isFiltered ? `${register.total} matching` : `${register.total} loans`}
          </span>
        </div>

        <RegisterFilters filters={register.filters} onChange={register.updateFilters} isFiltered={isFiltered} />

        {status === "OVERDUE" && staleOverdue > 0 ? (
          <p className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
            {staleOverdue === 1
              ? "1 loan is overdue by date but still stored as current."
              : `${staleOverdue} loans are overdue by date but still stored as current.`}{" "}
            The list reads the due dates, so they are counted here; the stored status moves when a payment is
            recorded.
          </p>
        ) : null}

        <RegisterTable
          rows={register.rows}
          isLoading={register.isLoading}
          onOpen={(row) => {
            setDetail(row);
            // QA 5: the detail dialog carries the installment breakdown, so the schedule is read with the row.
            loadSchedule(row.id, false);
          }}
        />

        <TablePager
          page={register.page}
          pageCount={pageCount}
          total={register.total}
          pageSize={register.pageSize}
          onPageChange={register.setPage}
          onPageSizeChange={register.setPageSize}
          isLoading={register.isLoading}
          className="border-t border-border/50 px-4 py-3"
        />
      </Card>

      <NewLoanDialog open={isNewOpen} onOpenChange={setNewOpen} accounts={accounts} onSaved={register.reload} />
      <LoanDetailDialog
        loan={detail}
        schedule={schedule}
        scheduleError={scheduleError}
        showingAll={scheduleAll}
        onShowAll={detail ? () => loadSchedule(detail.id, !scheduleAll) : undefined}
        onOpenChange={(open) => {
          if (open) return;
          setDetail(null);
          setSchedule(null);
          setScheduleError(null);
        }}
      />
    </div>
  );
}
