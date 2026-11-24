"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConsoleDialog, EmptyState, Kv, Panel, StatusChip } from "../console/components/ui";
import { MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, dateTime, peso } from "../members/format";
import type { ApprovalDetail } from "../server/approvals";
import type { WithdrawalDecision, WithdrawalDetail } from "../server/withdrawals";
import { SavingsReview, withdrawalMethodLabel } from "./SavingsReview";

export function WithdrawalReviewDialog({ id, reference, onChanged, onClose }: {
  id: number; reference: string; onChanged: () => void; onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ attempt: number; detail?: WithdrawalDetail; error?: string }>();
  const [action, setAction] = useState<"release" | "reject">();
  const [confirmed, setConfirmed] = useState(false);
  const [payoutReference, setPayoutReference] = useState("");
  const [reason, setReason] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const key = useRef<string | null>(null);
  const path = `/api/fm/cooperative/approvals/withdrawal/${id}`;

  useEffect(() => {
    const controller = new AbortController();
    memberFetch<Extract<ApprovalDetail, { type: "withdrawal" }>>(path, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setResponse({ attempt, detail: result.detail }); })
      .catch((cause: Error) => { if (!controller.signal.aborted) setResponse({ attempt, error: cause.message }); });
    return () => controller.abort();
  }, [path, attempt]);

  const current = response?.attempt === attempt ? response : undefined;
  const detail = current?.detail;
  const request = detail?.request;
  const review = detail?.review;
  const savings = review && "balance" in review && review.balance ? review : null;
  const isBank = request?.releaseMethod === "PAYROLL";
  const canRelease = Boolean(savings?.fingerprint && !review?.issue);
  const canSubmit = request?.status === "PENDING" && (action === "release"
    ? canRelease && confirmed && (!isBank || payoutReference.trim())
    : action === "reject" && reason.trim());

  function choose(next?: "release" | "reject") {
    setAction(next);
    setError("");
    setConfirmed(false);
    key.current = null;
  }

  async function submit() {
    if (!canSubmit || busy.current) return;
    busy.current = true;
    setPosting(true);
    setError("");
    key.current ??= newRequestKey();
    try {
      const result = await memberFetch<WithdrawalDecision>(`${path}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "release"
          ? { action, requestKey: key.current, confirmed, fingerprint: savings?.fingerprint, payoutReference }
          : { action, requestKey: key.current, reason }),
      });
      setNotice(result.journalNo ? `Withdrawal released · ${result.journalNo}` : "Withdrawal rejected.");
      choose();
      setAttempt(value => value + 1);
      onChanged();
    } catch (cause) {
      if (cause instanceof MemberApiError && cause.payload?.code === "STALE_WITHDRAWAL") {
        choose();
        setAttempt(value => value + 1);
        onChanged();
      }
      setError(cause instanceof Error ? cause.message : "The decision could not be confirmed.");
    } finally {
      busy.current = false;
      setPosting(false);
    }
  }

  return <ConsoleDialog open onOpenChange={open => { if (!open && !busy.current) onClose(); }}
    title="Withdrawal request" description={reference}>
    {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
    {(error || current?.error) && <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{error || current?.error}</p>
      {current?.error && <Button size="sm" variant="outline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry</Button>}
    </div>}
    {!current && <p role="status" className="text-sm">Loading withdrawal…</p>}
    {detail && request && <>
      <Panel title="Request details">
        <Kv rows={[
          ["Member", `${request.memberName} · ${request.memberNo}`], ["Filed", dateTime(request.filedAt)],
          ["Reason", request.requestReason || "—"], ["Amount", peso(request.amount)],
          ["Payout method", withdrawalMethodLabel[request.releaseMethod]], ["Status", <StatusChip key="status" status={request.status} />],
          ...(detail.journal ? [
            ["Payout date", date(detail.journal.date)], ["Journal", detail.journal.reference],
          ] as [string, string][] : []),
          ...(request.payoutReference ? [["Bank transfer reference", request.payoutReference]] as [string, string][] : []),
        ]} />
      </Panel>
      {request.status === "PENDING" && <Panel title="Savings and eligibility">
        {savings && <SavingsReview balance={savings.balance} annualUsage={savings.annualUsage} projectedSavings={savings.projectedSavings} />}
        {detail.warning && <p className="mt-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-sm">{detail.warning}</p>}
        {review?.issue && <div className="mt-2 space-y-2 text-sm">
          <p>{review.issue}</p>
          <Button size="sm" variant="outline" onClick={() => { choose(); setAttempt(value => value + 1); }}>Reload review</Button>
        </div>}
      </Panel>}
      {request.status === "PENDING" && !action && <div className="flex flex-wrap gap-2">
        <Button disabled={!canRelease} onClick={() => choose("release")}>Approve and release</Button>
        <Button variant="outline" onClick={() => choose("reject")}>Reject</Button>
      </div>}
      {request.status === "PENDING" && action && <Panel title={action === "release" ? "Confirm payout" : "Confirm rejection"}>
        <div className="space-y-3">
          {action === "release" ? <>
            {isBank && <label className="block space-y-1 text-sm">
              <span>Bank transfer reference</span>
              <Input value={payoutReference} maxLength={120} disabled={posting} required
                onChange={event => { key.current = null; setPayoutReference(event.target.value); }} />
            </label>}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmed} disabled={posting} onChange={event => setConfirmed(event.target.checked)} />
              {isBank ? `I confirm that ${peso(request.amount)} was transferred to the payroll bank account.`
                : `I confirm that ${peso(request.amount)} was handed to the member.`}
            </label>
          </> : <label className="block space-y-1 text-sm">
            <span>Rejection reason</span>
            <Textarea value={reason} maxLength={500} disabled={posting} required
              onChange={event => { key.current = null; setReason(event.target.value); }} />
          </label>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canSubmit || posting} onClick={() => void submit()}>
              {posting ? "Saving…" : action === "release" ? "Confirm release" : "Confirm rejection"}
            </Button>
            <Button variant="outline" disabled={posting} onClick={() => choose()}>Back</Button>
          </div>
        </div>
      </Panel>}
      <Panel title="History">
        {detail.history.length ? <ul className="divide-y">
          {detail.history.map(event => <li key={event.id} className="space-y-1 py-2 text-sm">
            <p className="font-medium">{event.action.replace(/^WITHDRAWAL_/, "").toLowerCase().replace(/^./, letter => letter.toUpperCase())}</p>
            <p className="text-xs text-muted-foreground">{event.occurredAtManila} · {event.actorName || `User ${event.actorId}`}</p>
            {event.reason && <p className="break-words">{event.reason}</p>}
          </li>)}
        </ul> : <EmptyState>No history recorded.</EmptyState>}
      </Panel>
    </>}
  </ConsoleDialog>;
}
