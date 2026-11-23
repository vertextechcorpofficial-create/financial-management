"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConsoleDialog, EmptyState, FilterBar, FilterField, Panel, StatusChip } from "../console/components/ui";
import { LoanMemberSelect } from "../loans/LoanMemberSelect";
import { MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, peso } from "../members/format";
import type { listActiveCooperativeMembers } from "../server/loan-enrollment";
import type { WithdrawalRequest } from "../server/withdrawal-store";
import type { StaffWithdrawalRequests, WithdrawalDecision, WithdrawalFilingReview } from "../server/withdrawals";
import { SavingsReview, withdrawalMethodLabel } from "./SavingsReview";

const endpoint = "/api/fm/cooperative/transactions/withdrawals";
type MemberChoices = Awaited<ReturnType<typeof listActiveCooperativeMembers>>;

function useWithdrawalData<T>(url: string | null, attempt: number, delay = 0) {
  const key = url && `${url}#${attempt}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!url || !key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      memberFetch<T>(url, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
        .catch((cause: Error) => { if (!controller.signal.aborted) setState({ key, error: cause.message }); });
    }, delay);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [url, key, delay]);
  const current = state?.key === key ? state : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(url && !current) };
}

export function StaffWithdrawals() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [filing, setFiling] = useState(false);
  const [cancelling, setCancelling] = useState<WithdrawalRequest>();
  const [notice, setNotice] = useState("");
  const params = new URLSearchParams({ search, status, page: String(page) });
  const { data, error, loading } = useWithdrawalData<StaffWithdrawalRequests>(`${endpoint}?${params}`, attempt, 200);
  const ready = data?.state === "ready" ? data : null;

  function onChanged(result: WithdrawalDecision) {
    setNotice(`${result.reference} ${result.status === "CANCELLED" ? "cancelled" : "filed for approval"}.`);
    setFiling(false);
    setCancelling(undefined);
    setAttempt(value => value + 1);
    if (result.status === "PENDING") {
      setPage(1);
      setSearch("");
      setStatus("PENDING");
    }
  }

  return <Panel title="Withdrawal requests"
    actions={ready && <Button size="sm" variant="outline" onClick={() => setFiling(true)}>Record withdrawal request</Button>}>
    {notice && <p role="status" className="mb-3 text-sm">{notice}</p>}
    {data?.state === "pending_rollout" ? <EmptyState>{data.message}</EmptyState> : <>
      <FilterBar count={ready?.total} noun="requests">
        <FilterField label="Search">
          <Input aria-label="Search withdrawal requests" placeholder="Member or reference" value={search} className="h-8"
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </FilterField>
        <FilterField label="Status">
          <NativeSelect aria-label="Withdrawal status" value={status} className="h-8"
            onChange={event => { setStatus(event.target.value); setPage(1); }}>
            <option value="PENDING">Pending</option><option value="ALL">All statuses</option>
            <option value="RELEASED">Released</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option>
          </NativeSelect>
        </FilterField>
      </FilterBar>
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        {error}<Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
      </div>}
      <Table aria-busy={loading}>
        <TableHeader><TableRow>
          <TableHead>Filed</TableHead><TableHead>Reference</TableHead><TableHead>Member</TableHead>
          <TableHead>Payout method</TableHead><TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead><TableHead />
        </TableRow></TableHeader>
        <TableBody>
          {!error && !ready?.rows.length && <TableRow><TableCell colSpan={7}>
            <EmptyState>{loading ? "Loading withdrawal requests…" : "No withdrawals match these filters."}</EmptyState>
          </TableCell></TableRow>}
          {ready?.rows.map(row => <TableRow key={row.id}>
            <TableCell>{date(row.filedOn)}</TableCell><TableCell className="font-mono">{row.reference}</TableCell>
            <TableCell>{row.memberName}<span className="block text-xs text-muted-foreground">{row.memberNo}</span></TableCell>
            <TableCell>{withdrawalMethodLabel[row.releaseMethod]}</TableCell>
            <TableCell className="text-right tabular-nums">{peso(row.amount)}</TableCell>
            <TableCell><StatusChip status={row.status} /></TableCell>
            <TableCell className="text-right">{row.status === "PENDING" && <Button type="button" size="sm" variant="ghost"
              onClick={() => setCancelling(row)}>Cancel request</Button>}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      {ready && <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <span>Page {ready.page}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={ready.page <= 1} onClick={() => setPage(ready.page - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={!ready.hasMore} onClick={() => setPage(ready.page + 1)}>Next</Button>
        </div>
      </div>}
    </>}
    {filing && <RecordWithdrawalDialog onClose={() => setFiling(false)} onFiled={onChanged} />}
    {cancelling && <CancelWithdrawalDialog request={cancelling} onClose={() => setCancelling(undefined)} onCancelled={onChanged}
      onStale={() => setAttempt(value => value + 1)} />}
  </Panel>;
}

function RecordWithdrawalDialog({ onClose, onFiled }: { onClose: () => void; onFiled: (result: WithdrawalDecision) => void }) {
  const [member, setMember] = useState<MemberChoices["members"][number]>();
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const key = useRef<string | null>(null);
  const choices = useWithdrawalData<MemberChoices>(`${endpoint}?${new URLSearchParams({
    select: "members", q: memberSearch, page: String(memberPage),
  })}`, lookupAttempt, 180);
  const review = useWithdrawalData<WithdrawalFilingReview>(member ? `${endpoint}?memberId=${member.id}` : null, reviewAttempt);
  const canFile = !!member && !!review.data && !review.data.issue && /^\d{1,10}(?:\.\d{1,2})?$/.test(amount.trim())
    && Number(amount) > 0 && Number(amount) <= Number(review.data.balance.availableSavings);

  function reload() {
    key.current = null;
    setReviewAttempt(value => value + 1);
  }

  async function submit() {
    if (!member || !review.data || !canFile || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    key.current ??= newRequestKey();
    try {
      onFiled(await memberFetch<WithdrawalDecision>(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, amount, releaseMethod: method, reason,
          fingerprint: review.data.fingerprint, requestKey: key.current }),
      }));
    } catch (cause) {
      if (cause instanceof MemberApiError && cause.payload?.code === "STALE_WITHDRAWAL") reload();
      setError(cause instanceof Error ? cause.message : "The withdrawal could not be filed.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return <ConsoleDialog open title="Record withdrawal request" onOpenChange={open => { if (!open && !busy.current) onClose(); }}
    footer={<><Button variant="outline" disabled={saving} onClick={onClose}>Close</Button>
      <Button disabled={!canFile || saving} onClick={() => void submit()}>{saving ? "Saving…" : "Submit for approval"}</Button></>}>
    <LoanMemberSelect member={member} members={choices.data?.members ?? []} page={memberPage}
      hasMore={choices.data?.hasMore ?? false} loading={choices.loading} error={choices.error}
      search={memberSearch} onSearchChange={value => { setMemberSearch(value); setMemberPage(1); }}
      onPageChange={setMemberPage} onRetry={() => setLookupAttempt(value => value + 1)} disabled={saving}
      onSelect={value => { setMember(value); key.current = null; setError(""); }} />
    {review.loading && <p role="status" className="text-sm">Checking savings…</p>}
    {review.error && <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{review.error}</p><Button size="sm" variant="outline" onClick={reload}>Retry</Button>
    </div>}
    {review.data && <Panel title="Savings and eligibility">
      <SavingsReview {...review.data} />
      {review.data.warning && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{review.data.warning}</p>}
      {review.data.issue && <p className="mt-2 text-sm text-destructive">{review.data.issue}</p>}
    </Panel>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">
        <span>Amount</span>
        <Input inputMode="decimal" value={amount} disabled={saving} onChange={event => { key.current = null; setAmount(event.target.value); }} />
      </label>
      <label className="space-y-1 text-sm">
        <span>Payout method</span>
        <NativeSelect aria-label="Payout method" className="w-full" value={method} disabled={saving}
          onChange={event => { key.current = null; setMethod(event.target.value); }}>
          <option value="CASH">{withdrawalMethodLabel.CASH}</option><option value="PAYROLL">{withdrawalMethodLabel.PAYROLL}</option>
        </NativeSelect>
      </label>
    </div>
    {review.data && Number(amount) > Number(review.data.balance.availableSavings) &&
      <p className="text-sm text-destructive">The amount exceeds the available savings.</p>}
    <label className="space-y-1 text-sm">
      <span>Reason (optional)</span>
      <Textarea value={reason} maxLength={200} disabled={saving} onChange={event => { key.current = null; setReason(event.target.value); }} />
    </label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </ConsoleDialog>;
}

function CancelWithdrawalDialog({ request, onClose, onCancelled, onStale }: {
  request: WithdrawalRequest; onClose: () => void; onCancelled: (result: WithdrawalDecision) => void; onStale: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const key = useRef<string | null>(null);
  async function cancel() {
    if (!reason.trim() || stale || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    key.current ??= newRequestKey();
    try {
      onCancelled(await memberFetch<WithdrawalDecision>(`${endpoint}/${request.id}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, requestKey: key.current }),
      }));
    } catch (cause) {
      if (cause instanceof MemberApiError && cause.payload?.code === "STALE_WITHDRAWAL") {
        setStale(true);
        onStale();
      }
      setError(cause instanceof Error ? cause.message : "The cancellation could not be confirmed.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return <ConsoleDialog open title="Cancel withdrawal request" description={`${request.reference} · ${request.memberName} · ${peso(request.amount)}`}
    onOpenChange={open => { if (!open && !busy.current) onClose(); }}
    footer={<><Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
      <Button variant="destructive" disabled={!reason.trim() || saving || stale} onClick={() => void cancel()}>
        {saving ? "Saving…" : "Confirm cancellation"}
      </Button></>}>
    <label className="space-y-1 text-sm">
      <span>Cancellation reason</span>
      <Textarea value={reason} maxLength={500} disabled={saving || stale}
        onChange={event => { key.current = null; setReason(event.target.value); }} required />
    </label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </ConsoleDialog>;
}
