"use client";

import { AlertTriangle, X } from "lucide-react";

import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";
import { StatusBadge } from "./StatusBadge";
import { TablePager, pageCountFor } from "./TablePager";
import {
  ACCENT,
  INSTALLMENT_STATUSES,
  INSTALLMENT_STATUS_LABEL,
  INSTALLMENT_STATUS_TONE,
  LOAN_STATUS_LABEL,
  toneClass,
} from "../constants";
import type { useSchedules } from "../hooks/useSchedules";
import type { LoanScheduleRow, ScheduleLoanEntry } from "../types";

const COLUMNS = 9;

function money(value: number): string {
  return formatCurrency(value);
}

function paidOn(row: LoanScheduleRow): number {
  return row.paid_principal + row.paid_interest + row.paid_penalty;
}

function paidTitle(row: LoanScheduleRow): string {
  const parts = [
    `Principal ${money(row.paid_principal)}`,
    `interest ${money(row.paid_interest)}`,
    `penalty ${money(row.paid_penalty)}`,
  ];
  if (row.paid_on) parts.push(`paid on ${row.paid_on}`);
  return parts.join(" · ");
}

function loanLabel(loan: ScheduleLoanEntry): string {
  return `${loan.loanNo} · ${loan.lenderName}`;
}

export function ScheduleTab({ schedules }: { schedules: ReturnType<typeof useSchedules> }) {
  const { data, filters, isLoading, updateFilters, page, pageSize, setPage, setPageSize, versions } = schedules;
  const hasLoans = data.loans.length > 0;
  const isFiltered = filters.status !== "ALL";
  const pageCount = pageCountFor(data.total, pageSize);

  const options = data.loans.map((loan) => ({
    value: String(loan.id),
    label: loanLabel(loan),
    searchText: `${loan.loanNo} ${loan.lenderName} ${LOAN_STATUS_LABEL[loan.status]}`,
    description:
      loan.versions.length > 0
        ? `${LOAN_STATUS_LABEL[loan.status]} · v${loan.scheduleVersion} · ${money(loan.outstandingPrincipal)}`
        : `${LOAN_STATUS_LABEL[loan.status]} · no schedule yet`,
  }));

  const tie = data.tie;

  return (
    <div className="space-y-4">
      <div className={`overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Amortization schedule</h2>
            <p className="text-xs text-muted-foreground">
              One row per installment, oldest first. Paid amounts are whatever has been allocated to the row.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {isFiltered ? `${data.total} matching` : `${data.total} period${data.total === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3">
          <div className="w-full min-w-0 sm:w-[280px]">
            <OptionCombobox
              options={options}
              value={filters.loanId === null ? "" : String(filters.loanId)}
              onChange={(value) => updateFilters({ loanId: value ? Number(value) : null, version: null })}
              placeholder="Choose a loan"
              searchPlaceholder="Search loan no. or lender"
              emptyLabel={hasLoans ? "No loan matches that search." : "No loan is registered yet."}
              className="h-9"
            />
          </div>

          <Select
            value={filters.version === null ? String(data.loan?.scheduleVersion ?? 1) : String(filters.version)}
            onValueChange={(value) => updateFilters({ version: Number(value) })}
            disabled={versions.length === 0}
          >
            <SelectTrigger
              className="h-9 w-full sm:w-[180px] [&>span]:min-w-0 [&>span]:truncate"
              aria-label="Schedule version"
            >
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {versions.length === 0 ? (
                <SelectItem value="1">No version yet</SelectItem>
              ) : (
                versions.map((version) => (
                  <SelectItem key={version} value={String(version)}>
                    Version {version}
                    {data.loan && version === data.loan.scheduleVersion ? " · current" : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(value) => updateFilters({ status: value })}>
            <SelectTrigger className="h-9 w-full sm:w-[170px]" aria-label="Installment status">
              <SelectValue className="truncate" placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="ALL">All statuses</SelectItem>
              {INSTALLMENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {INSTALLMENT_STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-[150px]">
            <DateField
              id="schedule-as-of"
              value={filters.asOf}
              onChange={(value) => updateFilters({ asOf: value })}
              placeholder="As of date"
              aria-label="As of date"
            />
          </div>

          {filters.status !== "ALL" || filters.version !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1 px-2 text-xs"
              onClick={() => updateFilters({ status: "ALL", version: null })}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </Button>
          ) : null}
        </div>

        {tie && !tie.ties ? (
          <div className={`flex items-start gap-2 border-b border-border/50 px-4 py-3 text-sm ${toneClass("warning")}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">The installments do not add up to what this version started with.</p>
              <p className="text-xs text-muted-foreground">
                Principal across this version is {money(tie.schedulePrincipal)} against {money(tie.loanPrincipal)} of
                principal open when it was written, a difference of {money(tie.difference)}. Regenerate the schedule, or
                check the last restatement.
              </p>
            </div>
          </div>
        ) : null}

        {!hasLoans ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">No loan has been registered yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A schedule belongs to a borrowing. Record the loan on the Loan Register, then release it here.
            </p>
          </div>
        ) : data.loan === null ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">Choose a loan to see its schedule.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The picker above lists every borrowing. The aging tab shows all of them at once.
            </p>
          </div>
        ) : isLoading && data.rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : data.rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">
              {isFiltered
                ? `No installment carries that status in version ${data.loan.scheduleVersion}.`
                : `This loan has no schedule in version ${data.loan.scheduleVersion}.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isFiltered
                ? "Clear the status filter to see every installment."
                : "A schedule is written when the loan is released. Generate it, then come back."}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto min-[1300px]:block">
              <Table className="[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px] text-right">Period</TableHead>
                    <TableHead className="w-[120px]">Due date</TableHead>
                    <TableHead className="w-[130px] text-right">Interest</TableHead>
                    <TableHead className="w-[130px] text-right">Principal</TableHead>
                    <TableHead className="w-[130px] text-right">Installment</TableHead>
                    <TableHead className="w-[140px] text-right">Opening principal</TableHead>
                    <TableHead className="w-[140px] text-right">Closing principal</TableHead>
                    <TableHead className="w-[130px] text-right">Paid</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-right tabular-nums">{row.period_no}</TableCell>
                      <TableCell>
                        {row.payment_due_date}
                        {row.payment_due_date !== row.due_date ? (
                          <span className="block text-xs text-muted-foreground" title="Scheduled date moved to a business day">
                            from {row.due_date}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.interest)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.principal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.payment)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {money(row.opening_principal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.closing_principal)}</TableCell>
                      <TableCell className="text-right tabular-nums" title={paidTitle(row)}>
                        {paidOn(row) > 0 ? money(paidOn(row)) : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={INSTALLMENT_STATUS_TONE[row.status]}>
                          {INSTALLMENT_STATUS_LABEL[row.status]}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-xs text-muted-foreground">
                      {data.total} installment{data.total === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.totals.interest)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.totals.principal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.totals.payment)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">—</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">—</TableCell>
                    <TableCell className="text-right tabular-nums">{money(data.totals.paid)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tie?.ties ? "Ties to principal" : "Does not tie"}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <ul className="divide-y divide-border min-[1300px]:hidden">
              {data.rows.map((row) => (
                <li key={row.id} className="space-y-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium tabular-nums">
                      Period {row.period_no} · {row.payment_due_date}
                    </span>
                    <StatusBadge tone={INSTALLMENT_STATUS_TONE[row.status]}>
                      {INSTALLMENT_STATUS_LABEL[row.status]}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Installment {money(row.payment)} · interest {money(row.interest)} · principal{" "}
                    {money(row.principal)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Closing principal {money(row.closing_principal)}
                    {paidOn(row) > 0 ? ` · paid ${money(paidOn(row))}` : ""}
                  </p>
                </li>
              ))}
            </ul>

            <TablePager
              page={page}
              pageCount={pageCount}
              total={data.total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              isLoading={isLoading}
              className="border-t border-border/50 px-4 py-3"
            />
          </>
        )}
      </div>
    </div>
  );
}

export { COLUMNS };
