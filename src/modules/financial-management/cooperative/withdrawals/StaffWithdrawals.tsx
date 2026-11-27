"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Loader2, Search, SearchX, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ConsoleDialog, EmptyState, Kv, Panel, StatusChip } from "../console/components/ui";
import { LoanMemberSelect } from "../loans/LoanMemberSelect";
import { PersonAvatar, SectionHeading } from "../members/components";
import { MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, peso } from "../members/format";
import type { listActiveCooperativeMembers } from "../server/loan-enrollment";
import type { WithdrawalRequest } from "../server/withdrawal-store";
import type { StaffWithdrawalRequests, WithdrawalDecision, WithdrawalFilingReview } from "../server/withdrawals";
import { SavingsReview, withdrawalMethodLabel } from "./SavingsReview";

const endpoint = "/api/fm/cooperative/transactions/withdrawals";
const pageSize = 50;
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

export function StaffWithdrawals({ onQueueChanged }: { onQueueChanged?: () => void }) {
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
  const hasFilters = Boolean(search.trim() || status !== "PENDING");
  const from = ready && ready.total > 0 ? (ready.page - 1) * pageSize + 1 : 0;
  const to = ready ? Math.min((ready.page - 1) * pageSize + ready.rows.length, ready.total) : 0;

  function changed(result: WithdrawalDecision) {
    setNotice(`${result.reference} ${result.status === "CANCELLED" ? "cancelled" : "filed for approval"}.`);
    setFiling(false);
    setCancelling(undefined);
    setAttempt(value => value + 1);
    onQueueChanged?.();
    if (result.status === "PENDING") {
      setPage(1);
      setSearch("");
      setStatus("PENDING");
    }
  }

  function clearFilters() {
    setSearch("");
    setStatus("PENDING");
    setPage(1);
  }

  return (
    <Panel
      title="Withdrawal requests"
      description="Record savings withdrawal requests and track their approval status."
      actions={ready ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/fm/cooperative/approvals">Open Approvals</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFiling(true)}>Record withdrawal request</Button>
        </div>
      ) : undefined}
    >
      {notice && (
        <div role="status" className="mb-3 flex flex-wrap items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
          <p className="min-w-0 flex-1">{notice}</p>
          <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setNotice("")} aria-label="Dismiss withdrawal notice">
            <X className="size-4" />
          </Button>
        </div>
      )}
      {data?.state === "pending_rollout" ? <EmptyState>{data.message}</EmptyState> : <>
        <div className="mb-4 rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground sm:col-span-2 xl:col-span-2">
              Search
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search withdrawal requests"
                  placeholder="Member or reference"
                  value={search}
                  onChange={event => { setSearch(event.target.value); setPage(1); }}
                  className="h-9 pl-8"
                />
              </div>
            </label>
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              Status
              <NativeSelect aria-label="Withdrawal status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="h-9 w-full">
                <option value="PENDING">Pending</option><option value="ALL">All statuses</option>
                <option value="RELEASED">Released</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option>
              </NativeSelect>
            </label>
            <div className="flex items-end justify-between gap-2 sm:col-span-2 xl:col-span-3">
              <p className="text-xs text-muted-foreground">
                {loading ? "Updating requests..." : `${ready?.total ?? 0} request${ready?.total === 1 ? "" : "s"} match`}
              </p>
              {hasFilters && (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
                  <X className="size-3.5" /> Clear filters
                </Button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
          </div>
        )}

        <div className="max-h-[60dvh] overflow-auto rounded-lg border">
          <Table className="min-w-full sm:min-w-[720px]" aria-busy={loading}>
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <TableRow className="hover:bg-transparent">
                <TableHead className="hidden md:table-cell">Filed</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="hidden sm:table-cell">Member</TableHead>
                <TableHead className="hidden lg:table-cell">Payout method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={cn("transition-opacity", loading && ready && "opacity-60")}>
              {loading && !ready && <WithdrawalSkeleton />}
              {!loading && !error && ready?.rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
                      <p className="text-sm font-medium">No withdrawal requests match these filters</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        {hasFilters ? "Try a different member, reference, or status." : "No withdrawal requests have been recorded yet."}
                      </p>
                      {hasFilters && <Button type="button" variant="outline" size="sm" className="mt-1" onClick={clearFilters}>Clear filters</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!error && ready?.rows.map(row => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell className="hidden whitespace-nowrap md:table-cell">{date(row.filedOn)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <p className="font-mono text-sm font-medium">{row.reference}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                      {row.memberName}{row.memberNo ? ` · ${row.memberNo}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">{withdrawalMethodLabel[row.releaseMethod]}</p>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell">
                    <div className="flex min-w-0 items-center gap-3">
                      <PersonAvatar name={row.memberName} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.memberName}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.memberNo}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">{withdrawalMethodLabel[row.releaseMethod]}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{peso(row.amount)}</TableCell>
                  <TableCell><StatusChip status={row.status} /></TableCell>
                  <TableCell className="text-right">
                    {row.status === "PENDING" && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(row)}>Cancel</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {ready && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
            <span>
              {ready.total > 0
                ? <>Showing <span className="font-medium text-foreground">{from}-{to}</span> of <span className="font-medium text-foreground">{ready.total}</span></>
                : "No records"}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={ready.page <= 1 || loading} onClick={() => setPage(ready.page - 1)}>
                <ChevronLeft className="size-3.5" /> Previous
              </Button>
              <span className="min-w-14 text-center font-medium text-foreground">Page {ready.page}</span>
              <Button size="sm" variant="outline" disabled={!ready.hasMore || loading} onClick={() => setPage(ready.page + 1)}>
                Next <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </>}
      {filing && <RecordWithdrawalDialog onClose={() => setFiling(false)} onFiled={changed} />}
      {cancelling && <CancelWithdrawalDialog request={cancelling} onClose={() => setCancelling(undefined)} onCancelled={changed}
        onStale={() => setAttempt(value => value + 1)} />}
    </Panel>
  );
}

function WithdrawalSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <TableRow key={index} className="hover:bg-transparent">
          <TableCell className="hidden md:table-cell"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell className="hidden sm:table-cell">
            <div className="flex items-center gap-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </TableCell>
          <TableCell className="hidden lg:table-cell"><div className="h-4 w-28 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-5 w-16 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell><div className="ml-auto h-8 w-16 animate-pulse rounded bg-muted" /></TableCell>
        </TableRow>
      ))}
    </>
  );
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

  return (
    <ConsoleDialog
      open
      title="Record withdrawal request"
      description="File a savings withdrawal for approval and reserve the amount."
      onOpenChange={open => { if (!open && !busy.current) onClose(); }}
      footerClassName="backdrop-blur"
      footer={<>
        <p className="mr-auto hidden max-w-48 text-left text-[11px] leading-4 text-muted-foreground sm:block">
          The request reserves the amount until it is released or rejected in Approvals.
        </p>
        <Button variant="outline" disabled={saving} onClick={onClose}>Close</Button>
        <Button disabled={!canFile || saving} onClick={() => void submit()}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? "Saving..." : "Submit for approval"}
        </Button>
      </>}
    >
      <div className="space-y-5">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{error}</p>
          </div>
        )}
        <section className="space-y-3">
          <SectionHeading step="1" title="Member" description="Only active Cooperative members appear here." />
          <LoanMemberSelect member={member} members={choices.data?.members ?? []} page={memberPage}
            hasMore={choices.data?.hasMore ?? false} loading={choices.loading} error={choices.error}
            search={memberSearch} onSearchChange={value => { setMemberSearch(value); setMemberPage(1); }}
            onPageChange={setMemberPage} onRetry={() => setLookupAttempt(value => value + 1)} disabled={saving}
            onSelect={value => { setMember(value); key.current = null; setError(""); }} />
        </section>
        <section className="space-y-3">
          <SectionHeading step="2" title="Savings review" description="The request is checked against the current savings and policy." />
          {review.loading && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking savings...
            </p>
          )}
          {review.error && (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{review.error}</p><Button size="sm" variant="outline" onClick={reload}>Retry</Button>
            </div>
          )}
          {review.data && (
            <div className="rounded-xl border bg-muted/20 p-3">
              <SavingsReview {...review.data} />
              {review.data.warning && (
                <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  {review.data.warning}
                </p>
              )}
              {review.data.issue && <p className="mt-2 text-sm text-destructive">{review.data.issue}</p>}
            </div>
          )}
          {!review.loading && !review.error && !review.data && (
            <p className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
              Choose a member to review available savings and pending reservations.
            </p>
          )}
        </section>
        <section className="space-y-3">
          <SectionHeading step="3" title="Withdrawal details" description="Enter the amount, payout method, and reason." />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Amount</span>
              <Input inputMode="decimal" value={amount} disabled={saving}
                onChange={event => { key.current = null; setAmount(event.target.value); }} />
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
            <Textarea value={reason} maxLength={200} disabled={saving}
              onChange={event => { key.current = null; setReason(event.target.value); }} />
          </label>
        </section>
      </div>
    </ConsoleDialog>
  );
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
  return (
    <ConsoleDialog
      open
      title="Cancel withdrawal request"
      description={`${request.reference} · ${request.memberName}`}
      onOpenChange={open => { if (!open && !busy.current) onClose(); }}
      footerClassName="backdrop-blur"
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
        <Button variant="destructive" disabled={!reason.trim() || saving || stale} onClick={() => void cancel()}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? "Saving..." : "Confirm cancellation"}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/20 p-3">
          <Kv rows={[
            ["Request", request.reference],
            ["Member", `${request.memberName} · ${request.memberNo}`],
            ["Amount", peso(request.amount)],
            ["Payout method", withdrawalMethodLabel[request.releaseMethod]],
            ["Status", request.status],
          ]} />
        </div>
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <label className="block space-y-1 text-sm">
          <span>Cancellation reason</span>
          <Textarea value={reason} maxLength={500} disabled={saving || stale}
            onChange={event => { key.current = null; setReason(event.target.value); }} required />
        </label>
      </div>
    </ConsoleDialog>
  );
}
