"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

import { StatusBadge } from "./StatusBadge";
import { TablePager, pageCountFor, pageSlice } from "./TablePager";
import { ACCENT, LOAN_STATUSES, LOAN_STATUS_LABEL, LOAN_STATUS_TONE, SELECT_VALUE_CLIP } from "../constants";
import { formatDateMDY } from "../pht";
import type { ScheduleLoanEntry } from "../types";

const DIRECTORY_PAGE_SIZE = 10;

function money(value: number): string {
  return formatCurrency(value);
}

/**
 * Level 1: the loan directory.
 *
 * The page opens here rather than on a dropdown, so the reader sees the book before committing
 * to one borrowing. Filtering and paging run on what the route already returned: this screen
 * never asks the server for a second copy of the register.
 */
export function LoanDirectory({
  loans,
  asOf,
  onOpen,
}: {
  loans: ScheduleLoanEntry[];
  asOf: string;
  onOpen: (loanId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DIRECTORY_PAGE_SIZE);

  const needle = search.trim().toLowerCase();
  const isFiltered = needle !== "" || status !== "ALL";

  const filtered = useMemo(
    () =>
      loans.filter((loan) => {
        if (status !== "ALL" && loan.status !== status) return false;
        if (!needle) return true;
        return `${loan.loanNo} ${loan.lenderName} ${loan.accountNo}`.toLowerCase().includes(needle);
      }),
    [loans, needle, status],
  );

  const rows = pageSlice(filtered, page, pageSize);
  const pageCount = pageCountFor(filtered.length, pageSize);

  function clearFilters() {
    setSearch("");
    setStatus("ALL");
    setPage(1);
  }

  return (
    <div className={`overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm border-t-[3px] ${ACCENT}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Loan directory</h2>
          <p className="text-xs text-muted-foreground">
            Every borrowing with its installments, oldest first. Open a loan to see its schedule.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {isFiltered
            ? `${filtered.length} of ${loans.length} loans`
            : `${loans.length} loan${loans.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3">
        <div className="relative w-full min-w-0 sm:w-[320px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Loan ID, lender or PN"
            aria-label="Search loans"
            className="h-9 pl-8"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger
            className={`h-9 w-full sm:w-[180px] ${SELECT_VALUE_CLIP}`}
            aria-label="Loan status"
            title={status === "ALL" ? "All statuses" : LOAN_STATUS_LABEL[status as keyof typeof LOAN_STATUS_LABEL]}
          >
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent className="max-h-60 min-w-[200px]">
            <SelectItem value="ALL">All statuses</SelectItem>
            {LOAN_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {LOAN_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFiltered ? (
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear filters
          </Button>
        ) : null}

        <span className="ml-auto hidden text-xs text-muted-foreground sm:block tabular-nums">
          As of {formatDateMDY(asOf)}
        </span>
      </div>

      {loans.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-medium">No loan has been registered yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A schedule belongs to a borrowing. Record the loan on the Loan Register, then release it here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-medium">No loan matches those filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">Clear them to see the whole directory.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto min-[1300px]:block">
            <Table className="[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Loan</TableHead>
                  <TableHead>Lender</TableHead>
                  <TableHead className="w-[200px]">PN / loan account</TableHead>
                  <TableHead className="w-[140px] text-right">Principal</TableHead>
                  <TableHead className="w-[120px]">Released</TableHead>
                  <TableHead className="w-[120px]">Maturity</TableHead>
                  <TableHead className="w-[130px]">Status</TableHead>
                  <TableHead className="w-[100px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableCell className="tabular-nums">{loan.loanNo}</TableCell>
                    <TableCell title={loan.lenderName} className="max-w-[240px] truncate">{loan.lenderName}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{loan.accountNo || "not set"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(loan.principal)}</TableCell>
                    <TableCell className="tabular-nums">{formatDateMDY(loan.releaseDate)}</TableCell>
                    <TableCell className="tabular-nums">{formatDateMDY(loan.maturityDate)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={LOAN_STATUS_TONE[loan.status]}>{LOAN_STATUS_LABEL[loan.status]}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onOpen(loan.id)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-border min-[1300px]:hidden">
            {rows.map((loan) => (
              <li key={loan.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium">
                      {loan.loanNo ? <span className="shrink-0 tabular-nums">{loan.loanNo}</span> : null}
                      {loan.lenderName ? (
                        <span title={loan.lenderName} className="line-clamp-2 min-w-0 flex-1">
                          {loan.lenderName}
                        </span>
                      ) : null}
                    </div>
                    <p title={`PN ${loan.accountNo || "not set"}`} className="truncate text-xs text-muted-foreground tabular-nums">
                      PN {loan.accountNo || "not set"} · released {formatDateMDY(loan.releaseDate)}
                    </p>
                  </div>
                  <StatusBadge tone={LOAN_STATUS_TONE[loan.status]}>{LOAN_STATUS_LABEL[loan.status]}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Principal {money(loan.principal)} · matures {formatDateMDY(loan.maturityDate)}
                </p>
                <Button type="button" size="sm" variant="outline" className="h-8 w-full" onClick={() => onOpen(loan.id)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>

          <TablePager
            page={page}
            pageCount={pageCount}
            total={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            className="border-t border-border/50 px-4 py-3"
          />
        </>
      )}
    </div>
  );
}
