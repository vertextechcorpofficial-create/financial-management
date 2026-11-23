"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConsoleDialog, Kv } from "../console/components/ui";
import { LoanMemberSelect } from "../loans/LoanMemberSelect";
import { fieldErrorsFrom, MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, peso } from "../members/format";
import type { listActiveCooperativeMembers } from "../server/loan-enrollment";
import type { SavingsDepositPreview, SavingsDepositResult } from "../server/savings-deposits";

const endpoint = "/api/fm/cooperative/transactions/savings-deposits";
export const savingsReceiptUrl = (journalId: number) => `${endpoint}/${journalId}/receipt`;
type Choices = Awaited<ReturnType<typeof listActiveCooperativeMembers>> & { today: string };

export function SavingsDepositDialog({ onClose, onPosted }: {
  onClose: () => void; onPosted: (result: SavingsDepositResult) => void;
}) {
  const [member, setMember] = useState<Choices["members"][number]>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<{ key: string; data?: Choices; error?: string }>();
  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState<string>();
  const [reference, setReference] = useState("");
  const [review, setReview] = useState<{ preview: SavingsDepositPreview; key: string }>();
  const [received, setReceived] = useState(false);
  const [result, setResult] = useState<SavingsDepositResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const busy = useRef(false);
  const query = new URLSearchParams({ q: search, page: String(page) }).toString();
  const lookupKey = `${query}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      memberFetch<Choices>(`${endpoint}?${query}`, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setLookup({ key: lookupKey, data }); })
        .catch((cause: Error) => { if (!controller.signal.aborted) setLookup({ key: lookupKey, error: cause.message }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, lookupKey]);

  const current = lookup?.key === lookupKey ? lookup : undefined;
  const today = lookup?.data?.today;
  const receivedOn = receiptDate ?? today ?? "";
  const canReview = !!member && /^\d{1,10}(?:\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0 && !!receivedOn;
  const draft = { memberId: member?.id, amount, receiptDate: receivedOn, reference };

  function resetReview() {
    setReview(undefined);
    setReceived(false);
    setError("");
    setFields({});
  }

  function send<T>(body: Record<string, unknown>) {
    return memberFetch<T>(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, ...body }),
    });
  }

  async function loadPreview() {
    const preview = await send<SavingsDepositPreview>({ action: "preview" });
    setReview({ preview, key: newRequestKey() });
    setReceived(false);
  }

  async function submit() {
    if (!canReview || busy.current || result || (review && !received)) return;
    setError("");
    setFields({});
    busy.current = true;
    setLoading(true);
    try {
      if (!review) {
        await loadPreview();
      } else {
        const posted = await send<SavingsDepositResult>({
          action: "post", fingerprint: review.preview.fingerprint, requestKey: review.key, cashReceived: received,
        });
        setResult(posted);
        onPosted(posted);
      }
    } catch (cause) {
      if (cause instanceof MemberApiError && cause.payload?.code === "STALE_DEPOSIT") {
        resetReview();
        try {
          await loadPreview();
          setError(cause.message);
        } catch (refreshError) {
          setError(refreshError instanceof Error ? refreshError.message : cause.message);
          setFields(fieldErrorsFrom(refreshError));
        }
      } else {
        setError(cause instanceof Error ? cause.message : "The deposit could not be completed.");
        setFields(fieldErrorsFrom(cause));
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return <ConsoleDialog open onOpenChange={open => { if (!open && !busy.current) onClose(); }}
    title="Savings deposit" description="Record cash received at the Cooperative counter."
    footer={result ? <Button onClick={onClose}>Close</Button> : <>
      <Button variant="outline" disabled={loading} onClick={onClose}>Cancel</Button>
      <Button disabled={loading || !canReview || (!!review && !received)} onClick={() => void submit()}>
        {loading ? "Please wait…" : review ? "Confirm deposit" : "Review deposit"}
      </Button>
    </>}>
    {error && <p role="alert" className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">{error}</p>}
    {result ? <div className="space-y-3">
      <p role="status" className="text-sm font-medium">Savings deposit posted.</p>
      <Kv rows={[
        ["Member", result.memberName], ["Deposit", peso(result.amount)], ["Updated savings", peso(result.balanceAfter)],
        ["Official receipt", result.orNo], ["Journal", result.journalNo],
      ]} />
      <Button type="button" size="sm" variant="outline" asChild>
        <a href={savingsReceiptUrl(result.journalId)} target="_blank" rel="noreferrer">Print official receipt</a>
      </Button>
    </div> : <>
      <LoanMemberSelect member={member} members={current?.data?.members ?? []} page={page}
        hasMore={current?.data?.hasMore ?? false} loading={!current} error={current?.error}
        search={search} onSearchChange={value => { setSearch(value); setPage(1); }} onPageChange={setPage}
        onRetry={() => setAttempt(value => value + 1)} disabled={loading} onSelect={value => { setMember(value); resetReview(); }} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>Amount</span>
          <Input inputMode="decimal" value={amount} disabled={loading} aria-invalid={!!fields.amount}
            onChange={event => { setAmount(event.target.value); resetReview(); }} required />
          {fields.amount && <span className="text-destructive">{fields.amount}</span>}
        </label>
        <label className="space-y-1 text-sm">
          <span>Receipt date</span>
          <Input type="date" value={receivedOn} max={today} disabled={loading} aria-invalid={!!fields.receiptDate}
            onChange={event => { setReceiptDate(event.target.value); resetReview(); }} required />
          {fields.receiptDate && <span className="text-destructive">{fields.receiptDate}</span>}
        </label>
      </div>
      <label className="space-y-1 text-sm">
        <span>Reference (optional)</span>
        <Input value={reference} maxLength={40} disabled={loading}
          onChange={event => { setReference(event.target.value); resetReview(); }} />
      </label>
      {review && <div className="space-y-3 rounded-md border p-3">
        <Kv rows={[
          ["Current savings", peso(review.preview.previousBalance)], ["Deposit", peso(review.preview.amount)],
          ["Savings after deposit", peso(review.preview.balanceAfter), "total"],
          ["Receipt date", date(review.preview.receiptDate)], ["Posting date", date(review.preview.businessDate)],
        ]} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={received} disabled={loading} onChange={event => setReceived(event.target.checked)} />
          I confirm that {peso(review.preview.amount)} was received in cash.
        </label>
      </div>}
    </>}
  </ConsoleDialog>;
}
