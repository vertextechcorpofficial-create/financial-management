"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CalendarDays, FolderClosed, HandCoins, History, Landmark,
  LayoutDashboard, ShieldCheck, Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsoleDialog, EmptyState, Kv, Panel, StatusChip } from "../console/components/ui";
import { LoanDecisionPanel, LoanReleaseDetails } from "../loans/LoanDecisionPanel";
import { MetricCard, PersonAvatar } from "../members/components";
import { date, peso, statusText } from "../members/format";
import type { LoanDecisionResult } from "../server/loan-decisions";
import type { ApprovalDetail, ApprovalQueue } from "../server/approvals";
import type { WithdrawalDecision } from "../server/withdrawals";
import { ApprovalDetailSkeleton, HistoryTimeline } from "./components";
import { WithdrawalDecisionPanel } from "./WithdrawalDecisionPanel";

type Row = ApprovalQueue["rows"][number];
type LoanDetail = Extract<ApprovalDetail, { type: "loan" }>["detail"];
type Withdrawal = Extract<ApprovalDetail, { type: "withdrawal" }>["detail"];
type LoadResult<T> = { key: string; data?: T; error?: string };
const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";

async function loadRequest<T>(url: string, signal: AbortSignal, message: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.message || message);
  return payload as T;
}

export function ApprovalDialog({ row, onChanged, onClose }: {
  row: Row;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult<ApprovalDetail>>();
  const [decision, setDecision] = useState<LoanDecisionResult>();
  const [withdrawalResult, setWithdrawalResult] = useState<WithdrawalDecision>();
  const path = `/api/fm/cooperative/approvals/${row.type}/${row.id}`;
  const requestKey = `${path}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const message = "Unable to load this request.";
    loadRequest<ApprovalDetail>(path, controller.signal, message)
      .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data }); })
      .catch(cause => { if (!controller.signal.aborted) setResult({ key: requestKey, error: cause instanceof Error ? cause.message : message }); });
    return () => controller.abort();
  }, [path, requestKey]);

  const current = result?.key === requestKey ? result : undefined;
  const detail = current?.data;
  const loanDetail = detail?.type === "loan" ? detail.detail : null;
  const withdrawalDetail = detail?.type === "withdrawal" ? detail.detail : null;
  const loan = loanDetail?.loan;
  const request = withdrawalDetail?.request;
  const memberName = loan?.memberName ?? request?.memberName ?? row.memberName;
  const typeLabel = row.type === "loan" ? "Loan" : "Withdrawal";
  const chipStatus = loan ? (loan.releasedOn ? "ACTIVE" : loan.status)
    : request ? (request.status === "RELEASED" ? "ACTIVE" : request.status)
      : row.released ? "ACTIVE" : row.status;
  const chipLabel = loan ? (loan.releasedOn ? "Released" : loan.status === "APPROVED" ? "For release" : undefined)
    : request ? (request.status === "RELEASED" ? "Released" : undefined)
      : row.status === "APPROVED" ? row.released ? "Released" : "For release" : undefined;
  const retry = () => setAttempt(value => value + 1);

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={(
        <span className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={memberName} size="lg" />
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate">{memberName}</span>
              <StatusChip status={chipStatus} label={chipLabel} />
            </span>
            <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
              {row.reference} · {row.title}
            </span>
          </span>
        </span>
      )}
      description={`${typeLabel} request · Filed ${date(row.filedAt)}`}
      footerClassName="mt-4 border-t pt-3"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
      wide
    >
      {!current && <ApprovalDetailSkeleton />}
      {current?.error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{current.error}</p>
          <Button variant="outline" size="sm" onClick={retry}>Retry request</Button>
        </div>
      )}
      {detail && <Tabs defaultValue="summary" className="w-full min-w-0">
        <TabsList className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
          <TabsTrigger value="summary" className={tabTriggerClass}><LayoutDashboard className="size-3.5" /> Summary</TabsTrigger>
          {detail.type === "loan" && <TabsTrigger value="documents" className={tabTriggerClass}><FolderClosed className="size-3.5" /> Documents</TabsTrigger>}
          <TabsTrigger value="history" className={tabTriggerClass}><History className="size-3.5" /> History</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          {loanDetail && (
            <LoanSummary
              detail={loanDetail}
              decision={decision}
              path={path}
              onChanged={value => {
                setDecision(value);
                setAttempt(current => current + 1);
                onChanged();
              }}
            />
          )}
          {withdrawalDetail && (
            <WithdrawalSummary
              detail={withdrawalDetail}
              endpoint={`${path}/decision`}
              result={withdrawalResult}
              onChanged={value => {
                setWithdrawalResult(value);
                setAttempt(current => current + 1);
                onChanged();
              }}
              onStale={() => {
                setWithdrawalResult(undefined);
                setAttempt(current => current + 1);
              }}
            />
          )}
        </TabsContent>

        {detail.type === "loan" && (
          <TabsContent value="documents" className="mt-4">
            <LoanDocuments detail={detail.detail} />
          </TabsContent>
        )}

        <TabsContent value="history" className="mt-4">
          <Panel title="History">
            <HistoryTimeline entries={detail.type === "loan" ? detail.detail.history : withdrawalHistory(detail.detail.history)} />
          </Panel>
        </TabsContent>
      </Tabs>}
    </ConsoleDialog>
  );
}

function LoanSummary({ detail, decision, path, onChanged }: {
  detail: LoanDetail;
  decision?: LoanDecisionResult;
  path: string;
  onChanged: (result: LoanDecisionResult) => void;
}) {
  const { loan } = detail;
  const release = detail.release ?? (decision?.journalNo ? decision : null);
  const pastDue = loan.pastDue !== "0.00";
  const showDecision = loan.status === "PENDING" || loan.status === "APPROVED";
  const balanceDetail = loan.status === "PENDING" || loan.status === "APPROVED" ? "Not released"
    : loan.status === "FULLY_PAID" ? "Fully paid"
      : pastDue ? `${peso(loan.pastDue)} past due` : "Current";

  return (
    <>
      {decision && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
          {decision.status === "ACTIVE" ? `Loan released · ${decision.journalNo}`
            : decision.status === "APPROVED" ? "Loan approved and ready for release." : "Loan rejected."}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Wallet} label="Principal" value={peso(loan.principal)} detail={loan.itemName ?? loan.purpose ?? undefined} tone="emerald" />
        <MetricCard
          icon={HandCoins}
          label={loan.productKind === "GOODS" ? "Markup" : "Rate"}
          value={loan.productKind === "GOODS" ? `${loan.markup}%` : `${loan.rate}%`}
          detail={loan.productKind === "GOODS" ? "Catalog price markup" : `${statusText(loan.method)} · per month`}
          tone="sky"
        />
        <MetricCard
          icon={CalendarDays}
          label="Term"
          value={`${loan.months} mo`}
          detail={`${loan.frequency === "CUTOFF" ? "Every cutoff" : "Monthly"} · ${loan.mode === "PAYROLL" ? "Salary deduction" : "Over the counter"}`}
          tone="slate"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Balance"
          value={peso(loan.balance)}
          detail={balanceDetail}
          tone={pastDue ? "rose" : loan.status === "FULLY_PAID" ? "slate" : "emerald"}
          alert={pastDue}
        />
      </div>
      <Panel title="Request details">
        <Kv rows={[
          ["Loan", loan.loanNo],
          ["Agreement", loan.agreementNo],
          ["Signature", loan.agreementSigned ? "Member signed" : "Awaiting signature"],
          ["Member", `${loan.memberName}${loan.memberNo ? ` · ${loan.memberNo}` : ""}`],
          ["Product", loan.productName],
          ["Filed", date(loan.appliedOn)],
          ["Status", loan.releasedOn ? "Released" : loan.status === "APPROVED" ? "For release" : statusText(loan.status)],
          ...(loan.approvedOn ? [["Approved", date(loan.approvedOn)]] as [string, string][] : []),
          ["Processing fee on release", peso(loan.processingFee)],
          ...(loan.signedPricing ? [
            ["Regular installment", peso(loan.signedPricing.regularPayment)],
            ["Final installment", peso(loan.signedPricing.finalPayment)],
          ] as [string, string][] : []),
          ...(loan.releasedOn && loan.releaseMethod ? [["Payout method", statusText(loan.releaseMethod)]] as [string, string][] : []),
          ...(loan.releasedOn && !release ? [["Released", date(loan.releasedOn)]] as [string, string][] : []),
          ["Total payable", peso(loan.totalPayable)],
        ]} />
      </Panel>
      {release && <LoanReleaseDetails release={release} />}
      {showDecision && (
        <LoanDecisionPanel
          endpoint={`${path}/decision`}
          onChanged={result => onChanged(result)}
        />
      )}
    </>
  );
}

function LoanDocuments({ detail }: { detail: LoanDetail }) {
  const { loan, documents } = detail;
  return (
    <Panel title="Documents" description="Read-only document compliance for this loan request.">
      <div className="space-y-3">
        {loan.documents.required.length === 0 && <EmptyState>No required documents recorded.</EmptyState>}
        {loan.documents.required.map(document => {
          const uploaded = loan.documents.done.some(item => item.documentTypeId === document.documentTypeId);
          return (
            <div key={document.documentTypeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <span>{document.name}</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline">{document.enforcement}</Badge>
                <StatusChip status={uploaded ? "ACTIVE" : "PARTIAL"} label={uploaded ? "On file" : "Missing"} />
              </span>
            </div>
          );
        })}
        {documents.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Files</h3>
            {documents.map(file => {
              const url = "/api/fm/cooperative/approvals/loan/" + loan.id + "/documents/" + encodeURIComponent(file.id);
              return (
                <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <span>
                    {file.fileName}
                    <span className="ml-2 text-xs text-muted-foreground">{date(file.uploadedAt)}</span>
                  </span>
                  <span className="flex gap-2">
                    <Button asChild size="sm" variant="outline"><a href={url} target="_blank" rel="noreferrer">Open</a></Button>
                    <Button asChild size="sm" variant="outline"><a href={url + "?download=1"}>Download</a></Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}

function withdrawalHistory(entries: Withdrawal["history"]) {
  return entries.map(entry => ({
    date: (entry.occurredAtManila || entry.occurredAt).slice(0, 10),
    text: `${statusText(entry.action)}${entry.reason ? ` · ${entry.reason}` : ""}`,
    actor: entry.actorName ?? (entry.actorId ? `User ${entry.actorId}` : null),
  }));
}

function WithdrawalSummary({ detail, endpoint, result, onChanged, onStale }: {
  detail: Withdrawal;
  endpoint: string;
  result?: WithdrawalDecision;
  onChanged: (result: WithdrawalDecision) => void;
  onStale: () => void;
}) {
  const { request } = detail;
  const review = detail.review && "fingerprint" in detail.review ? detail.review : null;
  const issue = detail.review && "issue" in detail.review ? detail.review.issue : null;
  const annual = review?.annualUsage;
  return (
    <>
      {result && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
          Withdrawal {statusText(result.status).toLowerCase()} · {result.reference}
          {result.journalNo ? ` · ${result.journalNo}` : ""}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Wallet} label="Amount requested" value={peso(request.amount)} detail={request.reference} tone="emerald" />
        {request.status === "PENDING" ? <>
          <MetricCard
            icon={Landmark}
            label="Posted savings"
            value={review ? peso(review.balance.postedSavings) : "Unavailable"}
            detail={review ? "Before this payout" : "Waiting for a verified review"}
            tone="slate"
          />
          <MetricCard
            icon={HandCoins}
            label="Projected savings"
            value={review ? peso(review.projectedSavings) : "—"}
            detail="After release"
            tone="sky"
          />
          <MetricCard
            icon={CalendarDays}
            label="Annual usage"
            value={annual ? (annual.limit === 0 ? "No limit" : `${annual.used} / ${annual.limit}`) : "—"}
            detail={annual ? `${annual.year} withdrawals` : "Waiting for review"}
            tone="amber"
          />
        </> : <>
          <MetricCard
            icon={ShieldCheck}
            label="Status"
            value={statusText(request.status)}
            detail={request.decidedAt ? `Decided ${date(request.decidedAt)}` : "Decision recorded"}
            tone={request.status === "RELEASED" ? "emerald" : request.status === "REJECTED" ? "rose" : "slate"}
          />
          <MetricCard
            icon={Landmark}
            label="Journal"
            value={detail.journal?.reference ?? "—"}
            detail={detail.journal ? date(detail.journal.date) : "No release journal"}
            tone="sky"
          />
          <MetricCard
            icon={HandCoins}
            label="Payout reference"
            value={request.payoutReference ?? "—"}
            detail={request.releaseMethod === "PAYROLL" ? "Payroll bank account" : "Cash at the office"}
            tone="slate"
          />
        </>}
      </div>

      {detail.warning && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{detail.warning}</p>
        </div>
      )}
      {issue && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{issue}</p>
        </div>
      )}

      <Panel title="Request details">
        <Kv rows={[
          ["Request", request.reference],
          ["Member", `${request.memberName}${request.memberNo ? ` · ${request.memberNo}` : ""}`],
          ["Release method", request.releaseMethod === "PAYROLL" ? "Payroll bank account" : "Cash at the office"],
          ["Filed", date(request.filedOn)],
          ["Request reason", request.requestReason || "—"],
          ["Status", statusText(request.status)],
          ...(request.decidedAt ? [["Decided", date(request.decidedAt)]] as [string, string][] : []),
          ...(request.decisionReason ? [["Decision reason", request.decisionReason]] as [string, string][] : []),
          ...(request.payoutReference ? [["Payout reference", request.payoutReference]] as [string, string][] : []),
          ...(detail.journal ? [["Journal", detail.journal.reference]] as [string, string][] : []),
        ]} />
      </Panel>

      {request.status === "PENDING" && review && !review.issue && (
        <WithdrawalDecisionPanel
          endpoint={endpoint}
          request={request}
          review={review}
          onChanged={onChanged}
          onStale={onStale}
        />
      )}
      {request.status === "PENDING" && !review && !issue && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          The payout review is unavailable. Reload the request before confirming a decision.
        </div>
      )}
    </>
  );
}
