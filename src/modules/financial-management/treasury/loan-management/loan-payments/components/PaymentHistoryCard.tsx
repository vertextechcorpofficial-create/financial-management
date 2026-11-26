"use client";

import { FilterX, Receipt, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";

import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "../constants";
import type { HistoryFilterState } from "../hooks/useLoanHistory";
import { mdy, phtDate } from "../pht";
import type { LoanHistoryRow, PaymentAccountRow } from "../types";
import { DateField } from "./DateField";
import { EmptyState } from "./EmptyState";
import { OptionCombobox } from "./OptionCombobox";
import { StatusBadge } from "./StatusBadge";

// Raw <th>/<td>, not the ui Table components, so the base padding has to be spelled out here.
const CELL =
  "[&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3";

/** Every bucket the payment covered, penalty first: dropping one made the split not add up. */
export function appliedLabel(row: LoanHistoryRow) {
  const parts: string[] = [];
  if (row.penaltyAmount > 0.005) parts.push(`${formatCurrency(row.penaltyAmount)} penalty`);
  if (row.interestAmount > 0.005) parts.push(`${formatCurrency(row.interestAmount)} interest`);
  if (row.principalAmount > 0.005) parts.push(`${formatCurrency(row.principalAmount)} principal`);
  if (row.advanceAmount > 0.005) parts.push(`${formatCurrency(row.advanceAmount)} advance`);
  // The bank charge is extra money out, not part of what the installment absorbed, so it is
  // appended rather than folded into the split.
  const applied = parts.length > 0 ? parts.join(" · ") : "nothing applied";
  return row.bankCharge > 0.005 ? `${applied} + ${formatCurrency(row.bankCharge)} charge` : applied;
}

interface Props {
  rows: LoanHistoryRow[];
  isLoading: boolean;
  accounts: PaymentAccountRow[];
  filters: HistoryFilterState;
  onChange: (patch: Partial<HistoryFilterState>) => void;
  onClear: () => void;
  onOpen: (row: LoanHistoryRow) => void;
}

export function PaymentHistoryCard({ rows, isLoading, accounts, filters, onChange, onClear, onOpen }: Props) {
  const isFiltered = filters.accountId !== null || filters.from !== "" || filters.to !== "";

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Payment history</h3>
          <p className="text-xs text-muted-foreground">Every receipt recorded against this loan, newest first.</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
          {formatNumber(rows.length)} {rows.length === 1 ? "receipt" : "receipts"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <OptionCombobox
          value={filters.accountId ? String(filters.accountId) : ""}
          onChange={(value) => onChange({ accountId: value === "" ? null : Number(value) })}
          placeholder="Paid from"
          searchPlaceholder="Search account"
          emptyLabel="No payment account is active."
          className="h-9 w-full justify-between sm:w-[230px]"
          options={[
            { value: "", label: "Paid from any account" },
            ...accounts.map((account) => ({ value: String(account.id), label: account.name })),
          ]}
        />

        <div className="w-full sm:w-[170px]">
          <DateField
            value={filters.from}
            onChange={(value) => onChange({ from: value })}
            placeholder="From"
            maxDate={phtDate()}
            aria-label="Payments from"
          />
        </div>

        <div className="w-full sm:w-[170px]">
          <DateField
            value={filters.to}
            onChange={(value) => onChange({ to: value })}
            placeholder="To"
            maxDate={phtDate()}
            aria-label="Payments to"
          />
        </div>

        {isFiltered ? (
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs" onClick={onClear}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        isFiltered ? (
          <EmptyState icon={FilterX} title="No payment matches these filters." hint="Clear them, or widen the date range." />
        ) : (
          <EmptyState
            icon={Receipt}
            title="No payment has been recorded against this loan yet."
            hint="Use Pay next installment above to record the first one."
          />
        )
      ) : (
        <>
          <div className="hidden overflow-x-auto min-[1300px]:block">
            <table className={`w-full min-w-[980px] border-collapse text-sm ${CELL}`}>
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium">Date</th>
                  <th className="text-right font-medium">Amount</th>
                  <th className="text-left font-medium">Applied to</th>
                  <th className="text-left font-medium">Paid from</th>
                  <th className="text-left font-medium">Recorded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => onOpen(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(row);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    <td>
                      <div className="flex items-center gap-2 tabular-nums">
                        {mdy(row.payment_date)}
                        {row.status === "REVERSED" ? (
                          <StatusBadge tone={PAYMENT_STATUS_TONE.REVERSED}>{PAYMENT_STATUS_LABEL.REVERSED}</StatusBadge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {row.payment_no}
                        {row.lenderReceipt ? ` · receipt ${row.lenderReceipt}` : ""}
                      </div>
                    </td>
                    <td className="text-right tabular-nums font-medium">{formatCurrency(row.amount)}</td>
                    <td className="text-xs text-muted-foreground">
                      <div className="max-w-[420px] whitespace-normal break-words" title={appliedLabel(row)}>
                        {appliedLabel(row)}
                      </div>
                    </td>
                    <td>
                      <div className="max-w-[180px] truncate" title={row.accountLabel ?? undefined}>
                        {row.accountLabel ?? "not recorded"}
                      </div>
                      <div className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABEL[row.method]}</div>
                    </td>
                    <td className="max-w-[180px] truncate text-muted-foreground" title={row.recordedBy ?? undefined}>
                      {row.recordedBy ?? "not recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border min-[1300px]:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => onOpen(row)} className="w-full px-4 py-3 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium tabular-nums">{mdy(row.payment_date)}</span>
                    <span className="tabular-nums font-medium">{formatCurrency(row.amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">
                      {row.payment_no}
                      {row.lenderReceipt ? ` · receipt ${row.lenderReceipt}` : ""}
                    </span>
                    {row.status === "REVERSED" ? (
                      <StatusBadge tone={PAYMENT_STATUS_TONE.REVERSED}>{PAYMENT_STATUS_LABEL.REVERSED}</StatusBadge>
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{appliedLabel(row)}</div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
