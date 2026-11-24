"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { ApprovalReviewPanel } from "./ApprovalReviewPanel";
import { BulkApprovalDialog } from "./BulkApprovalDialog";
import { approvalAgencies, approvalDecisions, approvalQueue, approvalReview } from "./api";
import { REQUEST_SLA_DAYS } from "./rules";
import type { ApprovalDecisionRow, ApprovalQueueItem, BulkApprovalResult } from "./types";

type Loader<T> = (signal: AbortSignal) => Promise<T>;

function useApprovalRead<T>(load: Loader<T> | null, refresh: number, delay = 0) {
  const [state, setState] = useState<{ load: Loader<T>; refresh: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal).then(data => {
        if (!controller.signal.aborted) setState({ load, refresh, data });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ load, refresh, error: error instanceof Error ? error.message : "Try loading the requests again." });
      });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, refresh, delay]);
  return state?.load === load && state.refresh === refresh ? state : undefined;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message} <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function Pagination({ name, page, hasMore, onPage }: { name: string; page: number; hasMore: boolean; onPage: (page: number) => void }) {
  if (page === 1 && !hasMore) return null;
  return <nav aria-label={name} className="flex flex-wrap justify-end gap-2">
    <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button>
    <span className="self-center text-xs">Page {page}</span>
    <Button type="button" size="sm" variant="outline" disabled={!hasMore} onClick={() => onPage(page + 1)}>Next</Button>
  </nav>;
}

function WaitingBadge({ days }: { days: number }) {
  const label = `${days} ${days === 1 ? "day" : "days"}`;
  if (days > REQUEST_SLA_DAYS) return <Badge variant="destructive">{label} · Overdue</Badge>;
  if (days === REQUEST_SLA_DAYS) return <Badge variant="outline" className="text-amber-700 dark:text-amber-400">{label} · SLA due</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

function DecisionsTable({ rows, onReview }: { rows: ApprovalDecisionRow[]; onReview: (id: number) => void }) {
  if (!rows.length) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">No decisions recorded.</p>;
  return <div className="overflow-hidden rounded-lg border">
    <Table>
      <TableHeader><TableRow>
        <TableHead>Request</TableHead><TableHead>Employee</TableHead><TableHead>Agency</TableHead>
        <TableHead>Decision</TableHead><TableHead>Decided by</TableHead><TableHead>Decided at</TableHead><TableHead>Remarks</TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map(item => <TableRow key={item.id}>
        <TableCell><Button type="button" size="sm" variant="link" className="px-0" onClick={() => onReview(item.requestId)}>{item.reference}</Button></TableCell>
        <TableCell>{item.employeeName ?? "—"}</TableCell><TableCell>{item.agencyName ?? "—"}</TableCell>
        <TableCell><Badge variant={item.decision === "APPROVED" ? "secondary" : "outline"}>{item.decision === "APPROVED" ? "Approved" : "Rejected"}</Badge></TableCell>
        <TableCell>{item.actorName}</TableCell>
        <TableCell><time dateTime={item.occurredAt}>{dateTime(item.occurredAt)} PHT</time></TableCell>
        <TableCell className="min-w-36 max-w-72 whitespace-pre-wrap break-words">{item.remarks ?? "—"}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>;
}

export function LoanApprovalModule() {
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [agencyRefresh, setAgencyRefresh] = useState(0);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmRows, setConfirmRows] = useState<ApprovalQueueItem[] | null>(null);
  const [batchResult, setBatchResult] = useState<BulkApprovalResult | null>(null);
  const [notice, setNotice] = useState("");

  const query = new URLSearchParams({ q: search.trim(), page: String(page) });
  if (agency) query.set("agency", agency);
  if (overdue) query.set("overdue", "1");
  const queryString = query.toString();
  const loadQueue = useCallback((signal: AbortSignal) => approvalQueue(queryString, signal), [queryString]);
  const loadHistory = useCallback((signal: AbortSignal) => approvalDecisions(historyPage, signal), [historyPage]);
  const loadReview = useCallback((signal: AbortSignal) => approvalReview(reviewId!, signal), [reviewId]);
  const queue = useApprovalRead(loadQueue, refresh, 160);
  const history = useApprovalRead(loadHistory, refresh);
  const agencies = useApprovalRead(approvalAgencies, agencyRefresh);
  const detail = useApprovalRead(reviewId === null ? null : loadReview, reviewRefresh);
  const eligible = queue?.data?.items.filter(row => row.filedChecksPass) ?? [];
  const selectedRows = eligible.filter(row => selected.includes(row.id));

  function changePage(next: number) {
    setPage(next);
    setSelected([]);
  }

  function refreshLists() {
    changePage(1);
    setHistoryPage(1);
    setRefresh(value => value + 1);
  }

  if (reviewId !== null) {
    if (detail?.data) return <ApprovalReviewPanel key={`${reviewId}:${reviewRefresh}`} review={detail.data}
      onBack={() => setReviewId(null)} onReload={() => setReviewRefresh(value => value + 1)} onDecision={message => {
        setReviewId(null);
        setBatchResult(null);
        setNotice(message);
        refreshLists();
      }} />;
    return <div className="space-y-3">
      <Button type="button" variant="ghost" onClick={() => setReviewId(null)}>Back to approvals</Button>
      {detail?.error ? <LoadError message={detail.error} retry={() => setReviewRefresh(value => value + 1)} /> :
        <p role="status" className="text-sm text-muted-foreground">Loading request…</p>}
    </div>;
  }

  return <div className="min-w-0 space-y-6">
    {confirmRows && <BulkApprovalDialog rows={confirmRows} onClose={() => setConfirmRows(null)} onComplete={result => {
      setConfirmRows(null);
      setBatchResult(result);
      setNotice("");
      refreshLists();
    }} />}
    {notice && <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
    {batchResult && <section aria-label="Bulk approval results" className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="font-medium">{batchResult.approved} approved · {batchResult.skipped} skipped</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setBatchResult(null)}>Dismiss results</Button>
      </div>
      {batchResult.skipped > 0 && <ul className="space-y-1">{batchResult.items.filter(item => item.outcome === "skipped")
        .map(item => <li key={item.id} className="break-words"><span className="font-medium">{item.reference}</span> · {item.reason}</li>)}</ul>}
    </section>}
    <section aria-label="Waiting for approval" className="space-y-3">
      <h2 className="text-base font-semibold">Waiting for approval</h2>
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Search requests" placeholder="Employee or request no." className="max-w-xs" value={search} maxLength={120}
          onChange={event => { setSearch(event.target.value); changePage(1); }} />
        <NativeSelect aria-label="Filter by agency" value={agency} disabled={!agencies?.data}
          onChange={event => { setAgency(event.target.value); changePage(1); }}>
          <option value="">All agencies</option>
          {agencies?.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={overdue} onCheckedChange={value => { setOverdue(value === true); changePage(1); }} /> Overdue only
        </label>
      </div>
      {agencies?.error && <LoadError message={agencies.error} retry={() => setAgencyRefresh(value => value + 1)} />}
      {!!selectedRows.length && <div className="flex flex-wrap items-center gap-3 rounded-lg border p-2 text-sm">
        <span>{selectedRows.length} selected</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setSelected([])}>Clear selection</Button>
        <Button type="button" size="sm" onClick={() => setConfirmRows(selectedRows)}>Approve selected</Button>
      </div>}
      {!queue && <p role="status" className="text-sm text-muted-foreground">Loading approval queue…</p>}
      {queue?.error && <LoadError message={queue.error} retry={refreshLists} />}
      {queue?.data && <>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead><Checkbox aria-label="Select eligible requests on this page" disabled={!eligible.length}
                checked={selectedRows.length > 0 && (selectedRows.length === eligible.length ? true : "indeterminate")}
                onCheckedChange={value => setSelected(value === true ? eligible.map(row => row.id) : [])} /></TableHead>
              <TableHead>Request</TableHead><TableHead>Employee</TableHead><TableHead>Agency</TableHead><TableHead>Program</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Filed</TableHead><TableHead>Checks at submission</TableHead><TableHead>Waiting</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!queue.data.items.length && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No requests waiting for approval.</TableCell></TableRow>}
              {queue.data.items.map(row => <TableRow key={row.id}>
                <TableCell><Checkbox aria-label={`Select ${row.reference}`} disabled={!row.filedChecksPass} checked={selected.includes(row.id)}
                  onCheckedChange={value => setSelected(ids => value === true ? [...ids, row.id] : ids.filter(id => id !== row.id))} /></TableCell>
                <TableCell><Button type="button" size="sm" variant="link" className="px-0" onClick={() => setReviewId(row.id)}>{row.reference}</Button></TableCell>
                <TableCell>{row.employeeName ?? "—"}</TableCell><TableCell>{row.agencyName ?? "—"}</TableCell><TableCell>{row.program}</TableCell>
                <TableCell className="text-right tabular-nums">{peso(row.amount)}</TableCell>
                <TableCell><time dateTime={row.requestedAt}>{dateTime(row.requestedAt)} PHT</time></TableCell>
                <TableCell><Badge variant="outline" className={row.filedChecksPass ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                  {row.filedChecksPass ? "OK" : "Review"}</Badge></TableCell>
                <TableCell><WaitingBadge days={row.waitingDays} /></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <Pagination name="Approval queue pages" page={page} hasMore={queue.data.hasMore} onPage={changePage} />
      </>}
    </section>
    <section aria-label="Recent decisions" className="space-y-3">
      <h2 className="text-base font-semibold">Recent decisions</h2>
      {!history && <p role="status" className="text-sm text-muted-foreground">Loading decisions…</p>}
      {history?.error && <LoadError message={history.error} retry={() => setRefresh(value => value + 1)} />}
      {history?.data && <>
        <DecisionsTable rows={history.data.items} onReview={setReviewId} />
        <Pagination name="Decision history pages" page={historyPage} hasMore={history.data.hasMore} onPage={setHistoryPage} />
      </>}
    </section>
  </div>;
}
