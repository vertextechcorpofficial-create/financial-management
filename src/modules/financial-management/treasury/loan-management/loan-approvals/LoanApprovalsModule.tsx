"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

import { Card } from "@/components/ui/card";

import { ACCENT, toneClass } from "./constants";
import { ApprovalDetailDialog } from "./components/ApprovalDetailDialog";
import { ApprovalFilters } from "./components/ApprovalFilters";
import { ApprovalsTable } from "./components/ApprovalsTable";
import { DecisionDialog, type DecisionKind } from "./components/DecisionDialog";
import { ReleaseDialog } from "./components/ReleaseDialog";
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
  const [decision, setDecision] = useState<DecisionKind | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);

  const { q, status, lenderType } = approvals.filters;
  const isFiltered = q.length > 0 || status !== "ALL" || lenderType !== "ALL";
  const pageCount = pageCountFor(approvals.total, pageSize);
  const pendingApproval = approvals.counts.PENDING_APPROVAL ?? 0;
  const pendingRelease = approvals.counts.PENDING_RELEASE ?? 0;

  async function readDetail(row: ApprovalQueueRow, channel: "TRANSFER" | "CHECK" | "CASH" = "TRANSFER") {
    setDetailLoading(true);
    setDetail(null);
    const loaded = await approvals.loadDetail(row.id, channel);
    setDetail(loaded);
    setDetailLoading(false);
    return loaded;
  }

  function closeAll() {
    setDecision(null);
    setReleaseOpen(false);
    setOpenRow(null);
    setDetail(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Loan Approvals</h1>
          <p className="text-xs text-muted-foreground">
            Approve or send back a new loan, then release the money and post it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums text-muted-foreground">
            {pendingApproval} pending approval
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums text-muted-foreground">
            {pendingRelease} to release
          </span>
        </div>
      </div>

      {approvals.error ? (
        <Card className={`flex items-start gap-2 border-l-[3px] p-3 text-sm ${toneClass("danger")}`}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">The approvals queue could not be read.</p>
            <p className="text-xs text-muted-foreground">{approvals.error}</p>
          </div>
        </Card>
      ) : null}

      <Card className={`overflow-hidden border-t-[3px] ${ACCENT}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Waiting for a decision</h2>
            <p className="text-xs text-muted-foreground">
              New loans and approved loans whose money has not arrived. Click a row to review it.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {isFiltered ? `${approvals.total} matching` : `${approvals.total} loan${approvals.total === 1 ? "" : "s"}`}
          </span>
        </div>

        <ApprovalFilters filters={approvals.filters} onChange={approvals.updateFilters} isFiltered={isFiltered} />

        <ApprovalsTable
          rows={approvals.rows}
          isLoading={approvals.isLoading}
          onOpen={(row) => {
            setOpenRow(row);
            void readDetail(row);
          }}
        />

        <div className="border-t px-4 py-3">
          <TablePager
            page={approvals.page}
            pageCount={pageCount}
            total={approvals.total}
            pageSize={pageSize}
            onPageChange={approvals.setPage}
            onPageSizeChange={setPageSize}
            allowAll={false}
            isLoading={approvals.isLoading}
          />
        </div>
      </Card>

      {openRow && !decision && !releaseOpen ? (
        <ApprovalDetailDialog
          row={openRow}
          detail={detail}
          isLoading={detailLoading}
          isSaving={approvals.isSaving}
          onClose={closeAll}
          onApprove={() => setDecision("APPROVE")}
          onReject={() => setDecision("REJECT")}
          onRelease={() => {
            setReleaseOpen(true);
            void readDetail(openRow);
          }}
        />
      ) : null}

      {openRow && decision ? (
        <DecisionDialog
          kind={decision}
          row={openRow}
          isSaving={approvals.isSaving}
          onClose={() => setDecision(null)}
          onSubmit={async (text) => {
            const result =
              decision === "APPROVE"
                ? await approvals.approve(openRow.id, text)
                : await approvals.reject(openRow.id, text);
            if (!result) return;
            if (decision === "REJECT") {
              closeAll();
              return;
            }
            setDecision(null);
            void readDetail({ ...openRow, status: "PENDING_RELEASE", approvalStatus: "APPROVED" });
          }}
        />
      ) : null}

      {openRow && releaseOpen && detail ? (
        <ReleaseDialog
          detail={detail}
          isSaving={approvals.isSaving}
          onClose={() => setReleaseOpen(false)}
          onSubmit={async (input) => {
            const result = await approvals.release(openRow.id, input);
            if (!result) return;
            closeAll();
          }}
        />
      ) : null}
    </div>
  );
}
