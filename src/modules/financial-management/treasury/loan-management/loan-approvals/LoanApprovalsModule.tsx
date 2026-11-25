"use client";

import { useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

import { Card } from "@/components/ui/card";

import { ACCENT, toneClass } from "./constants";
import { ApprovalDetailDialog } from "./components/ApprovalDetailDialog";
import { ApprovalFilters } from "./components/ApprovalFilters";
import { ApprovalsTable } from "./components/ApprovalsTable";
import { DecisionDialog, type DecisionKind } from "./components/DecisionDialog";
import { TablePager, pageCountFor, usePageSize } from "./components/TablePager";
import { useApprovals } from "./hooks/useApprovals";
import type { ApprovalDetail, ApprovalQueueRow } from "./types";

const PAGE_SIZE_KEY = "fm.loan-approvals.rows";

export function LoanApprovalsModule() {
  const [pageSize, setPageSize] = usePageSize(PAGE_SIZE_KEY);
  const approvals = useApprovals(pageSize);
  const [openRow, setOpenRow] = useState<ApprovalQueueRow | null>(null);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionKind | null>(null);
  // The loan a decision just took out of the queue, so the emptied table can say why.
  const [leftQueue, setLeftQueue] = useState<string | null>(null);
  // What the decision did, shown in place of the dialog's actions once it has been taken.
  const [outcome, setOutcome] = useState<string | null>(null);
  // The row or card that opened the detail, so closing the dialog puts focus back in the queue.
  const openerRef = useRef<HTMLElement | null>(null);

  const { q, status, lenderType } = approvals.filters;
  const isFiltered = q.length > 0 || status !== "ALL" || lenderType !== "ALL";
  const pageCount = pageCountFor(approvals.total, pageSize);

  async function readDetail(row: ApprovalQueueRow) {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    const loaded = await approvals.loadDetail(row.id);
    setDetail(loaded);
    if (!loaded)
      setDetailError(
        "The loan could not be read. The database may be busy; try again.",
      );
    setDetailLoading(false);
    return loaded;
  }

  /**
   * Closing is when the queue is re-read: reloading while the dialog was open pulled the row out
   * from under the reader and lost their place in the list.
   */
  function closeAll() {
    setDecision(null);
    setOpenRow(null);
    setDetail(null);
    setDetailError(null);
    setOutcome(null);
    void approvals.reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Loan Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Approve or reject submitted loans to post proceeds and activate
            repayment schedules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Counts the rows the table below shows, whatever the filters leave in it. */}
          <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums text-muted-foreground">
            {approvals.total} in the queue
          </span>
        </div>
      </div>

      {approvals.error ? (
        <Card
          className={`flex items-start gap-2 border-l-[3px] p-3 text-sm ${toneClass("danger")}`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              The approvals queue could not be read.
            </p>
            <p className="text-xs text-muted-foreground">{approvals.error}</p>
          </div>
        </Card>
      ) : null}

      <Card className={`overflow-hidden border-t-[3px] ${ACCENT}`}>
        {/* The count chip sits at the right edge of the filter band below, so the band fills the
            card instead of leaving half of it empty. */}
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Waiting for approval</h2>
          <p className="text-xs text-muted-foreground">
            Submitted loans still waiting for a decision. Click a row to review
            it.
          </p>
        </div>

        <ApprovalFilters
          filters={approvals.filters}
          onChange={approvals.updateFilters}
          isFiltered={isFiltered}
          countLabel={
            isFiltered
              ? `${approvals.total} matching`
              : `${approvals.total} loan${approvals.total === 1 ? "" : "s"}`
          }
        />

        <ApprovalsTable
          rows={approvals.rows}
          isLoading={approvals.isLoading}
          emptyNote={
            leftQueue ? `${leftQueue} left the queue after the decision.` : null
          }
          onOpen={(row, opener) => {
            openerRef.current = opener;
            setLeftQueue(null);
            setOpenRow(row);
            void readDetail(row);
          }}
        />

        <div>
          <TablePager
            page={approvals.page}
            pageCount={pageCount}
            total={approvals.total}
            pageSize={pageSize}
            onPageChange={approvals.setPage}
            onPageSizeChange={setPageSize}
            allowAll={false}
            isLoading={approvals.isLoading}
            className="border-t border-border/50 px-4 py-3"
          />
        </div>
      </Card>

      {/* The detail stays mounted under the decision overlay: closing the decision returns to the
          loan the reviewer was reading, instead of a blank screen and a second fetch (QA item 14). */}
      {openRow ? (
        <ApprovalDetailDialog
          row={openRow}
          detail={detail}
          isLoading={detailLoading}
          error={detailError}
          outcome={outcome}
          onRetry={() => void readDetail(openRow)}
          isSaving={approvals.isSaving}
          onClose={closeAll}
          onApprove={() => setDecision("APPROVE")}
          onReject={() => setDecision("REJECT")}
          returnFocusTo={openerRef}
        />
      ) : null}

      {openRow && decision ? (
        <DecisionDialog
          kind={decision}
          row={openRow}
          isSaving={approvals.isSaving}
          onClose={() => setDecision(null)}
          onSubmit={async (text) => {
            if (decision === "REJECT") {
              const rejected = await approvals.reject(openRow.id, text);
              if (!rejected) return;
              setLeftQueue(openRow.loanNo);
              closeAll();
              return;
            }
            const result = await approvals.approve(openRow.id, text);
            if (!result) return;
            setLeftQueue(openRow.loanNo);
            setDecision(null);
            // Approving posts the release in the same action, so the loan is CURRENT, the status the
            // service returned. QA item 16 retired the second step that used to follow.
            const approved: ApprovalQueueRow = {
              ...openRow,
              status: result.status,
              approvalStatus: "APPROVED",
            };
            setOpenRow(approved);
            setOutcome(
              `Approved and posted as ${result.entryNo}${
                result.scheduleRows > 0
                  ? ` · ${result.scheduleRows} repayments scheduled`
                  : ""
              }.`,
            );
            void readDetail(approved);
          }}
        />
      ) : null}
    </div>
  );
}
