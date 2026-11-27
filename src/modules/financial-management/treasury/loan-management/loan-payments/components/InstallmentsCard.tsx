"use client";

import { CalendarClock, Check, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

import {
  INSTALLMENT_FILTERS,
  INSTALLMENT_FILTER_LABEL,
  INSTALLMENT_STATUS_LABEL,
  INSTALLMENT_STATUS_TONE,
  type InstallmentFilter,
} from "../constants";
import { mdy } from "../pht";
import type { PaymentContext } from "../types";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

type Installment = PaymentContext["installments"][number];

// Raw <th>/<td>, not the ui Table components, so the base padding has to be spelled out here.
const CELL =
  "[&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The scheduled date, and under it the payable date when a holiday moved it. */
function dueCell(item: Installment) {
  return (
    <>
      <div className="tabular-nums">{mdy(item.dueDate)}</div>
      {item.paymentDueDate !== item.dueDate ? (
        <div className="text-xs text-muted-foreground">payable {mdy(item.paymentDueDate)} · moved off a weekend or holiday</div>
      ) : null}
    </>
  );
}

export function matchesInstallmentFilter(item: Installment, filter: InstallmentFilter): boolean {
  if (filter === "OVERDUE") return item.overdue;
  if (filter === "UNPAID") return item.totalOutstanding > 0;
  if (filter === "PAID") return item.totalOutstanding <= 0;
  return true;
}

interface Props {
  context: PaymentContext | null;
  isLoading: boolean;
  filter: InstallmentFilter;
  onFilterChange: (filter: InstallmentFilter) => void;
  selected: number[];
  onToggle: (installmentId: number) => void;
  onPay: (item: Installment) => void;
  onPaySelected: () => void;
}

export function InstallmentsCard({
  context,
  isLoading,
  filter,
  onFilterChange,
  selected,
  onToggle,
  onPay,
  onPaySelected,
}: Props) {
  const all = context?.installments ?? [];
  const rows = all.filter((item) => matchesInstallmentFilter(item, filter));
  const selectedTotal = round2(
    all.filter((item) => selected.includes(item.id)).reduce((total, item) => total + item.totalOutstanding, 0),
  );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Installments</h3>
          <p className="text-xs text-muted-foreground">
            What each period costs, what has been paid against it and what is still owed.
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
          {formatNumber(all.length)} {all.length === 1 ? "installment" : "installments"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter installments">
          {INSTALLMENT_FILTERS.map((value) => {
            const count = all.filter((item) => matchesInstallmentFilter(item, value)).length;
            const active = filter === value;
            return (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                className="h-8 gap-1.5 rounded-full px-3 text-xs"
                onClick={() => onFilterChange(value)}
              >
                {INSTALLMENT_FILTER_LABEL[value]}
                <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{formatNumber(count)}</span>
              </Button>
            );
          })}
        </div>

        {selected.length > 0 ? (
          <Button type="button" size="sm" className="ml-auto h-8 gap-1.5 text-xs" onClick={onPaySelected}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            Pay {selected.length} selected · {formatCurrency(selectedTotal)}
          </Button>
        ) : null}
      </div>

      {isLoading && !context ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={filter === "PAID" ? Receipt : CalendarClock}
          title={
            filter === "PAID"
              ? "Nothing has been paid on this loan yet."
              : filter === "OVERDUE"
                ? "No installment is past its payable date."
                : filter === "UNPAID"
                  ? "Every installment on this loan is settled."
                  : "This loan has no schedule yet."
          }
          hint={
            filter === "PAID"
              ? "Record the first payment above."
              : filter === "OVERDUE" || filter === "UNPAID"
                ? "Pick another pill to see the rest of the schedule."
                : "Rebuild it in the Loan Register first."
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto min-[1300px]:block">
            <table className={`w-full min-w-[1000px] border-collapse text-sm ${CELL}`}>
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 text-left font-medium">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="text-left font-medium">#</th>
                  <th className="text-left font-medium">Due</th>
                  <th className="text-right font-medium">Amount</th>
                  <th className="text-right font-medium">Paid</th>
                  <th className="text-right font-medium">Balance</th>
                  <th className="text-right font-medium">Penalty</th>
                  <th className="text-left font-medium">Status</th>
                  <th className="text-right font-medium">
                    <span className="sr-only">Pay</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((item) => {
                  const balance = round2(item.interestOutstanding + item.principalOutstanding);
                  const settled = item.totalOutstanding <= 0;
                  return (
                    <tr key={item.id} className={cn("transition-colors hover:bg-muted/40", selected.includes(item.id) && "bg-muted/30")}>
                      <td>
                        {settled ? (
                          <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
                        ) : (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={selected.includes(item.id)}
                            onChange={() => onToggle(item.id)}
                            aria-label={`Select installment ${item.periodNo}`}
                          />
                        )}
                      </td>
                      <td className="tabular-nums">{item.periodNo}</td>
                      <td>{dueCell(item)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(item.payment)}</td>
                      <td className="text-right tabular-nums text-muted-foreground">{formatCurrency(item.paidAmount)}</td>
                      <td className="text-right tabular-nums font-medium">{formatCurrency(balance)}</td>
                      <td className="text-right tabular-nums">
                        {item.penalty > 0 ? formatCurrency(item.penalty) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td>
                        <StatusBadge tone={INSTALLMENT_STATUS_TONE[item.status] ?? "neutral"}>
                          {INSTALLMENT_STATUS_LABEL[item.status] ?? item.status}
                        </StatusBadge>
                      </td>
                      <td className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          disabled={settled}
                          onClick={() => onPay(item)}
                        >
                          Pay
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border min-[1300px]:hidden">
            {rows.map((item) => {
              const balance = round2(item.interestOutstanding + item.principalOutstanding);
              const settled = item.totalOutstanding <= 0;
              return (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  {settled ? (
                    <span className="mt-1 inline-block h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={selected.includes(item.id)}
                      onChange={() => onToggle(item.id)}
                      aria-label={`Select installment ${item.periodNo}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium tabular-nums">#{item.periodNo}</span>
                      <StatusBadge tone={INSTALLMENT_STATUS_TONE[item.status] ?? "neutral"}>
                        {INSTALLMENT_STATUS_LABEL[item.status] ?? item.status}
                      </StatusBadge>
                    </div>
                    <div className="text-xs text-muted-foreground">{dueCell(item)}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                      <span className="tabular-nums">{formatCurrency(item.payment)}</span>
                      <span className="tabular-nums text-muted-foreground">balance {formatCurrency(balance)}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    disabled={settled}
                    onClick={() => onPay(item)}
                  >
                    Pay
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
