"use client";

import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

import { phtDisplayDate } from "../pht";
import { isDisbursementCheck } from "../disbursement-check";
import { StatusBadge } from "./StatusBadge";
import { TablePager } from "./TablePager";
import type { BankCheck } from "../types";

export type CheckAction = "RELEASE" | "DEPOSIT" | "CLEAR" | "RETURN" | "CANCEL" | "REPLACE" | "VIEW";

export type BatchMode = "RELEASE" | "DEPOSIT" | "CLEAR";

const BATCH_BUTTONS: { mode: BatchMode; label: string; done: string }[] = [
  { mode: "RELEASE", label: "Release", done: "released" },
  { mode: "DEPOSIT", label: "Deposit", done: "deposited" },
  { mode: "CLEAR", label: "Clear", done: "cleared" },
];

/**
 * Spec table 2, the fifteen rows, collapsed per direction and status.
 * The server enforces the same matrix; this only decides what the menu offers.
 */
export function allowedActions(check: BankCheck): { action: CheckAction; label: string; destructive?: boolean }[] {
  const actions: { action: CheckAction; label: string; destructive?: boolean }[] = [{ action: "VIEW", label: "View" }];
  const { status, direction } = check;

  if (status === "PENDING" && direction === "ISSUED") {
    // Rows 2 and 3: a post-dated check may still be released.
    actions.push({ action: "RELEASE", label: "Release" });
    actions.push({ action: "CANCEL", label: "Cancel check", destructive: true });
  }
  if (status === "RECEIVED") {
    // Row 8: a post-dated received check cannot be deposited yet.
    if (!check.isPdc) actions.push({ action: "DEPOSIT", label: "Deposit" });
    // Row 9.
    actions.push({ action: "CANCEL", label: "Cancel check", destructive: true });
  }
  if (status === "IN_CLEARING") {
    // Rows 4 and 10.
    actions.push({ action: "CLEAR", label: "Mark cleared" });
    // Rows 5, 6 and 11.
    actions.push({ action: "RETURN", label: "Record return" });
    if (direction === "ISSUED") actions.push({ action: "CANCEL", label: "Cancel check", destructive: true });
  }
  // Cleared is terminal: the bank has kept the money, so nothing may move it again.
  // The FSD's row 12 allowed a return after clearing; the third-QA review overruled it.
  if ((status === "RETURNED" || status === "CANCELLED") && !check.replacedById &&
      !isDisbursementCheck(direction, check.sourceRef)) {
    actions.push({ action: "REPLACE", label: "Replace check" });
  }
  return actions;
}

/** Spec section 5: a row is tickable only when a batch action can actually run on it. */
export function batchActionFor(check: BankCheck): BatchMode | null {
  if (check.status === "IN_CLEARING") return "CLEAR";
  if (check.status === "PENDING" && check.direction === "ISSUED") return "RELEASE";
  if (check.status === "RECEIVED" && !check.isPdc) return "DEPOSIT";
  return null;
}

const NOT_BATCHABLE_TITLE =
  "Only pending, received and in-clearing checks can be released, deposited or cleared together.";

const ACTION_MENU_CLASS: Record<CheckAction, string> = {
  VIEW: "",
  RELEASE: "text-blue-700 focus:text-blue-700 dark:text-blue-300 dark:focus:text-blue-300",
  DEPOSIT: "text-blue-700 focus:text-blue-700 dark:text-blue-300 dark:focus:text-blue-300",
  CLEAR: "text-emerald-700 focus:text-emerald-700 dark:text-emerald-300 dark:focus:text-emerald-300",
  RETURN: "text-amber-700 focus:text-amber-700 dark:text-amber-300 dark:focus:text-amber-300",
  CANCEL: "text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400",
  REPLACE: "",
};

type Props = {
  checks: BankCheck[];
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onAction: (check: BankCheck, action: CheckAction) => void;
  selected: Set<number>;
  onSelectionChange: (next: Set<number>) => void;
  onBatchAction: (mode: BatchMode) => void;
  /** Register-wide row count across every status; the header chip reports it. */
  total: number;
  /** True when any register filter is active, so the chip can read "N of M". */
  filtered: boolean;
  /** Filter band rendered inside the register card, like every other V2 table. */
  filters: ReactNode;
  /** Rows per page, held by the hook so the page request and the pager agree. */
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  /** Card-header controls (e.g. Reload), rendered beside the count chip. */
  headerActions?: ReactNode;
};

/** The check register: issued and received checks across every account. */
export function ChecksTable({
  checks,
  isLoading,
  page,
  onPageChange,
  onAction,
  selected,
  onSelectionChange,
  onBatchAction,
  total,
  filtered,
  filters,
  pageSize,
  onPageSizeChange,
  headerActions,
}: Props) {

  // The server pages now, so the rows that arrive are already the page: no slicing here. `total`
  // is the filtered count across every page, which is what the pager sizes itself from.
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = checks;

  const eligibleRows = checks.filter((row) => batchActionFor(row) !== null);
  const pageEligible = rows.filter((row) => batchActionFor(row) !== null);
  const allOnPageSelected = pageEligible.length > 0 && pageEligible.every((row) => selected.has(row.id));
  const selectedRows = checks.filter((row) => selected.has(row.id));
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.amount, 0);
  const selectedCounts: Record<BatchMode, number> = { RELEASE: 0, DEPOSIT: 0, CLEAR: 0 };
  for (const row of selectedRows) {
    const mode = batchActionFor(row);
    if (mode) selectedCounts[mode] += 1;
  }

  function toggle(id: number, next: boolean) {
    const draft = new Set(selected);
    if (next) draft.add(id);
    else draft.delete(id);
    onSelectionChange(draft);
  }

  function toggleAllOnPage(next: boolean) {
    const draft = new Set(selected);
    for (const row of pageEligible) {
      if (next) draft.add(row.id);
      else draft.delete(row.id);
    }
    onSelectionChange(draft);
  }

  return (
    <section
      aria-label="Check register"
      className="overflow-hidden rounded-2xl border border-border/50 border-t-[3px] border-t-amber-500/70 bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Check register</h2>
          <p className="text-xs text-muted-foreground">Click a row for its details and audit trail.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums text-[11px]">
            {filtered
              ? `${formatNumber(checks.length)} of ${formatNumber(total)} checks`
              : `${formatNumber(total)} checks`}
          </Badge>
          {headerActions}
        </div>
      </header>

      {filters}

      {isLoading ? (
        <div className="space-y-2 px-4 py-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : checks.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-sm font-medium">{filtered ? "No checks match these filters" : "No checks yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered
              ? "Clear a filter or widen the dates to see more."
              : "Issue a check, or record one received from a customer."}
          </p>
        </div>
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
        {selectedRows.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">Tick checks to release, deposit or clear them together.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={eligibleRows.length === 0}
              title={
                eligibleRows.length === 0
                  ? "No check in the current view can be released, deposited or cleared."
                  : filtered
                    ? "Selects the checks in the current view that a batch action can run on."
                    : undefined
              }
              onClick={() => onSelectionChange(new Set(eligibleRows.map((row) => row.id)))}
            >
              Select all eligible ({formatNumber(eligibleRows.length)})
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold">{selectedRows.length} selected</span>
              <span className="ml-2 text-muted-foreground tabular-nums">total {formatCurrency(selectedTotal)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {BATCH_BUTTONS.map(({ mode, label, done }) => {
                const count = selectedCounts[mode];
                return (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={mode === "CLEAR" ? "default" : "outline"}
                    disabled={count === 0}
                    title={count === 0 ? `No selected check can be ${done}.` : undefined}
                    onClick={() => onBatchAction(mode)}
                  >
                    {label} ({count})
                  </Button>
                );
              })}
              <Button type="button" variant="ghost" size="sm" onClick={() => onSelectionChange(new Set())}>
                Deselect all
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  aria-label="Select every eligible check on this page"
                  checked={allOnPageSelected}
                  disabled={pageEligible.length === 0}
                  onCheckedChange={(value) => toggleAllOnPage(value === true)}
                />
              </TableHead>
              <TableHead className="w-[122px]">Check no.</TableHead>
              <TableHead className="w-[92px]">Direction</TableHead>
              <TableHead className="w-[190px]">Account</TableHead>
              <TableHead className="w-[210px]">Payee / customer</TableHead>
              <TableHead className="w-[116px] text-right">Amount</TableHead>
              <TableHead className="w-[104px]">Check date</TableHead>
              <TableHead className="w-[156px]">Status</TableHead>
              <TableHead className="w-[56px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((check) => {
              return (
                <TableRow
                  key={check.id}
                  tabIndex={0}
                  aria-label={`Open check ${check.checkNo}`}
                  className="cursor-pointer"
                  onClick={() => onAction(check, "VIEW")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onAction(check, "VIEW");
                    }
                  }}
                >
                  <TableCell onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select check ${check.checkNo}`}
                      checked={selected.has(check.id)}
                      disabled={batchActionFor(check) === null}
                      title={batchActionFor(check) === null ? NOT_BATCHABLE_TITLE : undefined}
                      onCheckedChange={(value) => toggle(check.id, value === true)}
                    />
                  </TableCell>
                  <TableCell className="max-w-[130px] text-sm">
                    <span className="block truncate" title={check.checkNo}>
                      {check.checkNo}
                    </span>
                    {check.draweeBank ? (
                      <span className="block truncate text-xs text-muted-foreground" title={check.draweeBank}>
                        {check.draweeBank}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">{check.direction === "ISSUED" ? "Issued" : "Received"}</TableCell>
                  <TableCell className="max-w-[190px] text-sm">
                    {/* Account number leads; the bank it belongs to sits under it. */}
                    <p className="truncate" title={check.bankAccountNumber ?? check.bankAccountLabel}>
                      {check.bankAccountNumber ?? check.bankAccountLabel}
                    </p>
                    {check.bankAccountBank ? (
                      <p className="truncate text-[11px] text-muted-foreground" title={check.bankAccountBank}>
                        {check.bankAccountBank}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[210px] text-sm">
                    <span className="block truncate" title={check.payee ?? check.payor ?? undefined}>
                      {check.payee ?? check.payor ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatCurrency(check.amount)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{phtDisplayDate(check.checkDate)}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={check.status} />
                      {check.replacesNo || check.replacedByNo ? (
                        <Badge
                          variant="outline"
                          className="text-[11px] font-semibold text-muted-foreground"
                          title="Part of a replacement chain; open the check to see it."
                        >
                          Replacement
                        </Badge>
                      ) : null}
                      {check.isStale ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-semibold",
                            "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
                          )}
                        >
                          Stale
                        </Badge>
                      ) : check.isPdc ? (
                        <Badge variant="outline" className="border-border bg-muted text-[11px] font-semibold text-muted-foreground">
                          PDC
                        </Badge>
                      ) : null}
                    </span>
                    {check.isPdc && check.status === "RECEIVED" ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Deposit from {phtDisplayDate(check.checkDate)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`More actions for check ${check.checkNo}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[190px]">
                        <DropdownMenuLabel className="truncate text-xs">{check.checkNo}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {allowedActions(check).map((entry) => (
                          <DropdownMenuItem
                            key={entry.action}
                            onSelect={() => onAction(check, entry.action)}
                            className={ACTION_MENU_CLASS[entry.action]}
                          >
                            {entry.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border xl:hidden">
        {rows.map((check) => (
          <li
            key={check.id}
            tabIndex={0}
            aria-label={`Open check ${check.checkNo}`}
            className="cursor-pointer p-4"
            onClick={() => onAction(check, "VIEW")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onAction(check, "VIEW");
              }
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Checkbox
                  aria-label={`Select check ${check.checkNo}`}
                  checked={selected.has(check.id)}
                  disabled={batchActionFor(check) === null}
                  title={batchActionFor(check) === null ? NOT_BATCHABLE_TITLE : undefined}
                  onCheckedChange={(value) => toggle(check.id, value === true)}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={check.checkNo}>
                  {check.checkNo} · {check.direction === "ISSUED" ? "Issued" : "Received"}
                </p>
                <p className="truncate text-xs" title={check.payee ?? check.payor ?? undefined}>
                  {check.payee ?? check.payor ?? "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={check.bankAccountLabel}>
                  {check.bankAccountNumber ?? check.bankAccountLabel} · {phtDisplayDate(check.checkDate)}
                </p>
                {check.bankAccountBank ? (
                  <p className="truncate text-[11px] text-muted-foreground" title={check.bankAccountBank}>
                    {check.bankAccountBank}
                  </p>
                ) : null}
              </div>
              <StatusBadge status={check.status} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
              <span className="text-sm tabular-nums">{formatCurrency(check.amount)}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[190px]">
                  {allowedActions(check).map((entry) => (
                    <DropdownMenuItem
                      key={entry.action}
                      onSelect={() => onAction(check, entry.action)}
                      className={ACTION_MENU_CLASS[entry.action]}
                    >
                      {entry.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        ))}
      </ul>
        </>
      )}

      <TablePager
        page={safePage}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        allowAll={false}
        onPageChange={onPageChange}
        onPageSizeChange={(size) => {
          onPageSizeChange(size);
          onPageChange(1);
        }}
        className="border-t border-border/50 px-4 py-3"
      />
    </section>
  );
}
