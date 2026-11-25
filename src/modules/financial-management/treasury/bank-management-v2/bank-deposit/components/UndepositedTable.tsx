"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

import { phtDate, toPhtDateString } from "../pht";
import { toneClass } from "../constants";
import { assetBlockReason, isPostDated } from "../eligibility";
import { pageCountFor, pageSlice, TablePager } from "./TablePager";
import { UndepositedFiltersBar } from "./UndepositedFilters";
import type { UndepositedAsset, UndepositedFilters } from "../types";

type Props = {
  assets: UndepositedAsset[];
  totalCount: number;
  filters: UndepositedFilters;
  selected: Set<number>;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onFiltersChange: (filters: UndepositedFilters) => void;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean, ids: number[]) => void;
  onSelectAllReady: (ids: number[]) => void;
  onDeselectAll: () => void;
  onOpenRow: (asset: UndepositedAsset) => void;
  /** Money value of the current selection, so the slip amount is visible before the dialog opens. */
  selectedAmount: number;
};

/**
 * Names each active filter so the empty state can say what hid the rows. A cashier who searches
 * for one customer must never be told the queue itself is empty.
 */
function activeFilterLabels(filters: UndepositedFilters): string[] {
  const labels: string[] = [];
  if (filters.q.trim()) labels.push(`search “${filters.q.trim()}”`);
  if (filters.type !== "ALL") labels.push(filters.type === "CASH" ? "cash only" : "checks only");
  if (filters.canDeposit !== "ALL") labels.push(filters.canDeposit === "READY" ? "ready now" : "post-dated");
  if (filters.from) labels.push(`collected from ${filters.from}`);
  if (filters.to) labels.push(`collected to ${filters.to}`);
  return labels;
}

/**
 * Undeposited collections and checks, with row selection feeding the deposit dialog.
 * PDC checks are selectable only from their check date onward, per FSD 1.3.
 */
export function UndepositedTable({
  assets,
  totalCount,
  filters,
  selected,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onFiltersChange,
  onToggle,
  onToggleAll,
  onSelectAllReady,
  onDeselectAll,
  onOpenRow,
  selectedAmount,
}: Props) {
  const pageCount = pageCountFor(assets.length, pageSize);
  const safePage = Math.min(page, pageCount);
  const rows = pageSlice(assets, safePage, pageSize);
  const today = phtDate();
  const isPdc = (asset: UndepositedAsset) => isPostDated(asset, today);
  const blockReason = (asset: UndepositedAsset) => assetBlockReason(asset, today);
  const isDisabled = (asset: UndepositedAsset) => blockReason(asset) !== null;
  const selectableIds = rows.filter((asset) => !isDisabled(asset)).map((asset) => asset.collectionInvoiceId);
  // "Ready" ignores paging: the button exists for the common case of depositing everything at once.
  const readyIds = assets.filter((asset) => !isDisabled(asset)).map((asset) => asset.collectionInvoiceId);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const activeLabels = activeFilterLabels(filters);
  const hasFilters = activeLabels.length > 0;

  return (
    <section
      aria-label="Undeposited collections"
      className="overflow-hidden rounded-2xl border border-border/50 border-t-[3px] border-t-emerald-500/70 bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Collections on hand</h2>
          <p className="text-xs text-muted-foreground">
            Tick the collections going on one deposit slip, then choose the bank.
          </p>
        </div>
        <Badge variant="outline" className="tabular-nums text-[11px]">
          {/* One receipt settles in several lines (cash, each cheque, the odd adjustment), so the
              count names lines; a receipt's own total is printed on its rows, not here. */}
          {hasFilters
            ? `${formatNumber(assets.length)} of ${formatNumber(totalCount)} lines`
            : `${formatNumber(totalCount)} lines`}
        </Badge>
      </header>

      <UndepositedFiltersBar filters={filters} onChange={onFiltersChange} />

      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border/50 bg-muted/20 px-4 py-2">
        {selected.size > 0 ? (
          <p className="mr-auto text-xs text-muted-foreground">
            <span className="tabular-nums">{formatNumber(selected.size)}</span> selected ·{" "}
            <span className="tabular-nums">{formatCurrency(selectedAmount)}</span> going on the slip
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={readyIds.length === 0 || readyIds.every((id) => selected.has(id))}
          onClick={() => onSelectAllReady(readyIds)}
        >
          Select all ready
        </Button>
        {selected.size > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onDeselectAll}>
            Deselect all
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        hasFilters ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No collections match these filters — {formatNumber(totalCount)} are waiting.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Active: {activeLabels.join(" · ")}. Clear them to see the whole queue.</p>
          </div>
        ) : (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">Nothing is waiting to be deposited.</p>
        )
      ) : (
        <>
          <div className="hidden overflow-x-auto xl:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all undeposited items on this page"
                      checked={allSelected}
                      onCheckedChange={(checked) => onToggleAll(checked === true, selectableIds)}
                    />
                  </TableHead>
                  <TableHead className="w-[110px] whitespace-nowrap">Collected</TableHead>
                  <TableHead className="w-[150px]">Type</TableHead>
                  <TableHead className="w-[170px]">OR / check no.</TableHead>
                  <TableHead className="min-w-[180px]">Customer</TableHead>
                  <TableHead className="w-[140px] whitespace-nowrap pr-6 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((asset) => {
                  const pdc = isPdc(asset);
                  const blocked = blockReason(asset);
                  return (
                    <TableRow
                      key={asset.collectionInvoiceId}
                      data-state={selected.has(asset.collectionInvoiceId) ? "selected" : undefined}
                      tabIndex={0}
                      aria-label={`Open ${asset.documentNumber}`}
                      className={cn("cursor-pointer", blocked && "bg-muted/30")}
                      onClick={() => onOpenRow(asset)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenRow(asset);
                        }
                      }}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${asset.documentNumber}`}
                          disabled={blocked !== null}
                          checked={selected.has(asset.collectionInvoiceId)}
                          onCheckedChange={() => onToggle(asset.collectionInvoiceId)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-sm">
                        {asset.collectionDate ? toPhtDateString(asset.collectionDate) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-semibold",
                            toneClass(asset.methodLabel === "Cash" ? "success" : asset.methodLabel === "Check" ? "info" : "warning"),
                          )}
                        >
                          {asset.methodLabel}
                        </Badge>
                        {asset.assetType === "CHECK" && asset.bankName ? (
                          <p className="mt-0.5 max-w-[140px] truncate text-[11px] text-muted-foreground" title={asset.bankName}>
                            {asset.bankName}
                          </p>
                        ) : null}
                        {pdc ? (
                          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                            Post-dated, deposit from {asset.chequeDate ? toPhtDateString(asset.chequeDate) : "—"}
                          </p>
                        ) : blocked ? (
                          <p className="mt-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">{blocked}</p>
                        ) : asset.assetType === "CASH" && asset.ageDays >= 1 ? (
                          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">Over a day on hand</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="w-[170px]">
                        <p className="truncate font-mono text-sm" title={asset.documentNumber}>
                          {asset.documentNumber}
                        </p>
                        {asset.checkNo ? (
                          <p className="truncate text-[11px] text-muted-foreground" title={asset.checkNo}>
                            Check {asset.checkNo}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="min-w-[180px] text-sm">
                        {asset.customer ? (
                          <p className="truncate" title={asset.customer}>
                            {asset.customer}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">—</p>
                        )}
                        {asset.customerCode && asset.customerCode !== asset.customer ? (
                          <p className="truncate font-mono text-[11px] text-muted-foreground" title={asset.customerCode}>
                            {asset.customerCode}
                          </p>
                        ) : null}
                        {!asset.customer && !asset.customerCode ? (
                          <p className="text-[11px] text-amber-800 dark:text-amber-300">No customer on record</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="w-[140px] whitespace-nowrap pr-6 text-right text-sm tabular-nums">
                        {formatCurrency(asset.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-border xl:hidden">
            {rows.map((asset) => {
              const pdc = isPdc(asset);
              const blocked = blockReason(asset);
              return (
                <li
                  key={asset.collectionInvoiceId}
                  className={cn("flex cursor-pointer items-start gap-3 p-4", blocked && "bg-muted/30")}
                  onClick={() => onOpenRow(asset)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenRow(asset);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Open ${asset.documentNumber}`}
                >
                  <span
                    className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={`Select ${asset.documentNumber}`}
                      disabled={blocked !== null}
                      checked={selected.has(asset.collectionInvoiceId)}
                      onCheckedChange={() => onToggle(asset.collectionInvoiceId)}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-mono text-sm font-medium" title={asset.documentNumber}>
                        {asset.documentNumber}
                      </p>
                      <span className="shrink-0 text-sm tabular-nums">{formatCurrency(asset.amount)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground" title={asset.customer ?? undefined}>
                      {asset.methodLabel} · {asset.customer ?? "Unassigned customer"}
                    </p>
                    {asset.customerCode && asset.customerCode !== asset.customer ? (
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{asset.customerCode}</p>
                    ) : null}
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Collected {asset.collectionDate ? toPhtDateString(asset.collectionDate) : "—"}
                      {asset.collectionReference && asset.collectionReference !== asset.documentNumber
                        ? ` · ${asset.collectionReference}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs">
                      {blocked ? (
                        <Badge variant="outline" className={cn("text-[11px] font-semibold", toneClass("warning"))}>
                          {blocked}
                        </Badge>
                      ) : pdc ? (
                        <span className="text-muted-foreground">
                          PDC · deposit from {asset.chequeDate ? toPhtDateString(asset.chequeDate) : "—"}
                        </span>
                      ) : asset.assetType === "CASH" && asset.ageDays >= 1 ? (
                        <Badge variant="outline" className={cn("text-[11px] font-semibold", toneClass("warning"))}>
                          Over 1 day
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Ready</span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <TablePager
            page={safePage}
            pageCount={pageCount}
            total={assets.length}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            className="border-t border-border/50 px-4 py-3"
          />
        </>
      )}
    </section>
  );
}
