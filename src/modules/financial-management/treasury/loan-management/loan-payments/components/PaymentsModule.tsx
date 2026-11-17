"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";

import { ACCENT, PAYMENT_PAGE_SIZE } from "../constants";
import { usePayments } from "../hooks/usePayments";
import { Notice } from "./Notice";
import { PaymentDetailDialog } from "./PaymentDetailDialog";
import { PaymentsFilters } from "./PaymentsFilters";
import { PaymentsTable } from "./PaymentsTable";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { TablePager, pageCountFor } from "./TablePager";

export function PaymentsModule() {
  const payments = usePayments();
  const [isRecordOpen, setRecordOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const isFiltered =
    payments.filters.q.trim().length > 0 ||
    payments.filters.method !== "ALL" ||
    payments.filters.status !== "ALL" ||
    payments.filters.loanId !== null;

  const pageCount = pageCountFor(payments.total, payments.pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Loan Payments</h1>
        <Button
          type="button"
          className="min-h-11 md:min-h-0"
          onClick={() => {
            if (payments.loans.length === 0) {
              toast.error("No open loan can take a payment yet.");
              return;
            }
            setRecordOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          New payment
        </Button>
      </div>

      {payments.error ? (
        <Notice tone="danger" title="Payments could not be read.">
          {payments.error}
        </Notice>
      ) : null}

      <Card className={`border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Payments</h3>
            <p className="text-xs text-muted-foreground">
              Posted {formatNumber(payments.summary.posted)} · paid this month {formatCurrency(payments.summary.amountThisMonth)} ·
              penalties {formatCurrency(payments.summary.penaltyCharged)} · advance held {formatCurrency(payments.summary.advanceHeld)}
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
            {isFiltered
              ? `${formatNumber(payments.total)} matching`
              : `${formatNumber(payments.total)} ${payments.total === 1 ? "payment" : "payments"}`}
          </span>
        </div>

        <PaymentsFilters filters={payments.filters} loans={payments.loans} onChange={payments.updateFilters} />

        <PaymentsTable
          rows={payments.rows}
          isLoading={payments.isLoading}
          isFiltered={isFiltered}
          onOpen={(row) => setDetailId(row.id)}
        />

        <TablePager
          page={payments.page}
          pageCount={pageCount}
          total={payments.total}
          pageSize={payments.pageSize}
          onPageChange={payments.setPage}
          onPageSizeChange={payments.setPageSize}
          allowAll={false}
          isLoading={payments.isLoading}
          className="border-t border-border"
        />
      </Card>

      <RecordPaymentDialog
        open={isRecordOpen}
        onOpenChange={setRecordOpen}
        loans={payments.loans}
        onRecorded={() => void payments.reload()}
      />

      <PaymentDetailDialog
        paymentId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onChanged={() => void payments.reload()}
      />
    </div>
  );
}

export default PaymentsModule;
export { PAYMENT_PAGE_SIZE };
