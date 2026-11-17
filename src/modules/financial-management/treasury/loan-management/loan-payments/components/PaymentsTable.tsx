"use client";

import { formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

import { PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "../constants";
import type { PaymentListRow } from "../types";
import { StatusBadge } from "./StatusBadge";

const COLUMNS = 7;

function stamp(value: string) {
  return value ? value.slice(0, 10) : "—";
}

/** Every bucket the payment covered, penalty first: dropping one made the split not add up. */
function appliedLabel(row: PaymentListRow) {
  const parts: string[] = [];
  if (row.penaltyAmount > 0) parts.push(`${formatCurrency(row.penaltyAmount)} penalty`);
  if (row.interestAmount > 0) parts.push(`${formatCurrency(row.interestAmount)} interest`);
  if (row.principalAmount > 0) parts.push(`${formatCurrency(row.principalAmount)} principal`);
  if (row.advanceAmount > 0) parts.push(`${formatCurrency(row.advanceAmount)} advance`);
  // The bank charge is extra money out, not part of what the installment absorbed, so it is
  // appended rather than folded into the split.
  const applied = parts.length > 0 ? parts.join(" · ") : "—";
  return row.bank_charge > 0 ? `${applied} + ${formatCurrency(row.bank_charge)} charge` : applied;
}

interface Props {
  rows: PaymentListRow[];
  isLoading: boolean;
  isFiltered: boolean;
  onOpen: (row: PaymentListRow) => void;
}

export function PaymentsTable({ rows, isLoading, isFiltered, onOpen }: Props) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <div className="px-4 py-14 text-center text-sm text-muted-foreground">
        {isFiltered
          ? "No payment matches these filters. Clear the search or pick another loan."
          : "No payment has been recorded yet. Open a loan and record the first one."}
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto min-[1300px]:block">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Payment</th>
              <th className="px-4 py-2.5 text-left font-medium">Loan</th>
              <th className="px-4 py-2.5 text-left font-medium">Paid on</th>
              <th className="px-4 py-2.5 text-left font-medium">Method</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5 text-left font-medium">Applied</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
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
                <td className="px-4 py-3">
                  <div className="font-medium tabular-nums">{row.payment_no}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.lender_receipt ? `Receipt ${row.lender_receipt}` : row.kind === "CATCH_UP" ? PAYMENT_KIND_LABEL.CATCH_UP : "—"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[220px] truncate" title={`${row.loan_no ?? ""} ${row.lenderName ?? ""}`}>
                    {row.loan_no ?? "—"}
                  </div>
                  <div className="max-w-[220px] truncate text-xs text-muted-foreground">{row.lenderName ?? "—"}</div>
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{stamp(row.payment_date)}</td>
                <td className="px-4 py-3">{PAYMENT_METHOD_LABEL[row.method]}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.amount)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  <div className="max-w-[230px] truncate" title={appliedLabel(row)}>
                    {appliedLabel(row)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={PAYMENT_STATUS_TONE[row.status]}>{PAYMENT_STATUS_LABEL[row.status]}</StatusBadge>
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
                <span className="font-medium tabular-nums">{row.payment_no}</span>
                <StatusBadge tone={PAYMENT_STATUS_TONE[row.status]}>{PAYMENT_STATUS_LABEL[row.status]}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">{row.loan_no ?? "—"} · {row.lenderName ?? "—"}</span>
                <span className="tabular-nums">{stamp(row.payment_date)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                <span>{PAYMENT_METHOD_LABEL[row.method]}</span>
                <span className="tabular-nums font-medium">{formatCurrency(row.amount)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

    </>
  );
}

export { COLUMNS };
