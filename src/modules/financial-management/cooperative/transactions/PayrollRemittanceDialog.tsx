"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConsoleDialog, Kv, StatusChip } from "../console/components/ui";
import { formatDateTime } from "../console/format";
import { date, peso } from "../members/format";
import { MemberApiError, memberFetch, newRequestKey } from "../members/client";
import type { RemittanceReversalPreview } from "../server/payroll-remittance-reversal";
import type { RemittanceBatchList } from "../server/payroll-remittance-store";
import type { RemittanceDetail, RemittancePreview, RemittanceResult } from "../server/payroll-remittances";
import { PayrollRunSelect } from "./PayrollRunSelect";

const endpoint = "/api/fm/cooperative/transactions/payroll-remittances";
type Detail = RemittanceDetail | RemittancePreview;
type View = "upload" | "history" | "detail";
const labels: Record<string, string> = {
  READY: "Ready", REVIEW: "In review", POSTED: "Posted", REVERSED: "Reversed", INVALID: "Invalid",
  UNMATCHED: "Unmatched", AMBIGUOUS: "Ambiguous", DUPLICATE: "Duplicate", SHORT: "Short",
};
const json = (body: object) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function PayrollRemittanceDialog({ initialView, initialBatchId, onClose, onChanged }: {
  initialView: View;
  initialBatchId?: number;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [view, setView] = useState(initialView);
  const [batchId, setBatchId] = useState(initialBatchId);
  const [runId, setRunId] = useState<number>();
  const [detail, setDetail] = useState<Detail>();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [reverse, setReverse] = useState<RemittanceReversalPreview>();
  const [search, setSearch] = useState("");
  const [historyQuery, setHistoryQuery] = useState({ search: "", page: 1 });
  const [history, setHistory] = useState<{ query: typeof historyQuery; data?: RemittanceBatchList; error?: string }>();

  useEffect(() => {
    if (view !== "history") return;
    const controller = new AbortController();
    const query = new URLSearchParams({ search: historyQuery.search, page: String(historyQuery.page) });
    memberFetch<RemittanceBatchList>(`${endpoint}?${query}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setHistory({ query: historyQuery, data }); })
      .catch((cause: Error) => { if (!controller.signal.aborted) setHistory({ query: historyQuery, error: cause.message }); });
    return () => controller.abort();
  }, [view, historyQuery]);

  const hasDetail = detail?.batch.id === batchId;
  useEffect(() => {
    if (view !== "detail" || !batchId || hasDetail) return;
    const controller = new AbortController();
    memberFetch<RemittanceDetail>(`${endpoint}/${batchId}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDetail(current => current?.batch.id === batchId ? current : data); })
      .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [view, batchId, hasDetail]);

  function changeView(next: View, id?: number) {
    setView(next);
    setBatchId(id);
    setDetail(undefined);
    setStale(false);
    setError("");
    setReverse(undefined);
    setReason("");
    setConfirmed(false);
    if (next === "history") setHistoryQuery({ ...historyQuery });
    if (next === "upload") setRunId(undefined);
  }

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      if (cause instanceof MemberApiError && cause.payload?.code === "STALE_REMITTANCE") {
        setStale(true);
        setReverse(undefined);
        setConfirmed(false);
      }
      setError(cause instanceof Error ? cause.message : "The remittance request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function openPreview(data: Detail) {
    setDetail(data);
    setStale(false);
    setBatchId(data.batch.id);
    setView("detail");
    setKey(newRequestKey());
    setConfirmed(false);
  }

  async function submit(action: "post" | "reverse") {
    const fingerprint = action === "post" ? detail?.review?.fingerprint : reverse?.fingerprint;
    if (!batchId || !fingerprint) return;
    const result = await memberFetch<RemittanceResult>(`${endpoint}/${batchId}`,
      json({ action, fingerprint, confirmed: true, requestKey: key, ...(action === "reverse" ? { reason } : {}) }));
    setReverse(undefined);
    setReason("");
    setConfirmed(false);
    onChanged(`Payroll remittance ${action === "post" ? "posted" : "reversed"} · ${result.journalNo}`);
    setStale(true);
    setDetail(await memberFetch<RemittanceDetail>(`${endpoint}/${batchId}`));
    setStale(false);
  }

  const historyData = history?.query === historyQuery ? history : undefined;
  const batch = detail?.batch;
  const posted = batch && "posted_at" in batch ? batch : undefined;
  const review = stale ? null : detail?.review;
  const title = view === "upload" ? "Payroll remittance" : view === "history" ? "Payroll remittance batch history" : "Payroll remittance batch";
  return <ConsoleDialog open wide title={title} onOpenChange={open => { if (!open && !busy) onClose(); }}
    description={batch ? `${batch.file_name} · ${batch.bank_reference}` : undefined}
    footer={<>
      <Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>
      {view !== "history" && <Button variant="outline" disabled={busy} onClick={() => changeView("history")}>Batch history</Button>}
      {view === "history" && <Button disabled={busy} onClick={() => changeView("upload")}>New remittance</Button>}
      {view === "upload" && <Button type="submit" form="remittance-upload" disabled={busy || !runId}>Preview remittance</Button>}
      {batch?.state === "REVIEW" && !review && <Button disabled={busy} onClick={() => void act(async () =>
        openPreview(await memberFetch<RemittanceDetail>(`${endpoint}/${batchId}?review=1`)))}>Refresh review</Button>}
      {review && <Button disabled={busy || !review.canPost || !confirmed} onClick={() => void act(() => submit("post"))}>Confirm batch</Button>}
      {batch?.state === "POSTED" && !reverse && <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
        const preview = await memberFetch<RemittanceReversalPreview>(`${endpoint}/${batchId}`, json({ action: "review-reversal" }));
        setReverse(preview);
        setKey(newRequestKey());
      })}>Review reversal</Button>}
      {reverse && <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => void act(() => submit("reverse"))}>Confirm reversal</Button>}
      {view === "detail" && !detail && error && <Button variant="outline" disabled={busy} onClick={() => void act(async () => {
        setDetail(await memberFetch<RemittanceDetail>(`${endpoint}/${batchId}`));
      })}>Reload batch</Button>}
    </>}>
    {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Processing payroll remittance…</p>}
    {view === "upload" && <form id="remittance-upload" className="space-y-4" onSubmit={event => {
      event.preventDefault();
      if (!runId) return;
      const fields = new FormData(event.currentTarget);
      fields.set("payrollRunId", String(runId));
      void act(async () => openPreview(await memberFetch<RemittancePreview>(endpoint, { method: "POST", body: fields })));
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <PayrollRunSelect endpoint={endpoint} value={runId} onChange={setRunId} disabled={busy} />
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">Bank receipt date<Input type="date" name="bankDate" required disabled={busy} /></label>
          <label className="block space-y-1 text-sm">Bank receipt reference<Input name="bankReference" maxLength={80} required disabled={busy} /></label>
          <label className="block space-y-1 text-sm">Bank receipt amount (PHP)<Input name="bankAmount" maxLength={22} required disabled={busy} inputMode="decimal" /></label>
        </div>
      </div>
      <div className="space-y-2 rounded-md border p-3">
        <label className="block space-y-1 text-sm">Remittance workbook
          <Input type="file" name="file" accept=".xlsx" required disabled={busy} />
        </label>
        <p className="text-xs text-muted-foreground">Use COOP_SAVINGS for savings and COOP_LOAN for loan payments. Enter the loan number or payroll deduction reference as text. Up to 250 rows per file.</p>
        <Button variant="outline" size="sm" asChild><a href={`${endpoint}?action=template`}>Download Excel template</a></Button>
      </div>
    </form>}
    {view === "history" && <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setHistoryQuery({ search, page: 1 }); }}>
        <label className="block flex-1 space-y-1 text-sm">Search batch history
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Bank reference, file name or journal" />
        </label>
        <Button type="submit" variant="outline">Search</Button>
      </form>
      {(historyData?.error || !historyData?.data) && <p role={historyData?.error ? "alert" : "status"} className="text-sm">
        {historyData?.error ?? "Loading batch history…"}
      </p>}
      <div className="max-h-[45dvh] overflow-auto rounded-md border">
        <Table><TableHeader><TableRow><TableHead>Cutoff</TableHead><TableHead>Bank receipt</TableHead>
          <TableHead>Posted amount</TableHead><TableHead>Status</TableHead><TableHead>Clearing journal</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {historyData?.data?.rows.map(row => <TableRow key={row.id}>
              <TableCell>{date(row.cutoff_date)}</TableCell>
              <TableCell className="whitespace-normal">{row.bank_reference}<span className="block text-xs text-muted-foreground">{row.file_name}</span></TableCell>
              <TableCell>{peso(row.posted_amount)}</TableCell><TableCell><StatusChip status={labels[row.state]} /></TableCell>
              <TableCell>{row.clearing_journal_no ?? "—"}</TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => changeView("detail", row.id)}>View batch</Button></TableCell>
            </TableRow>)}
            {historyData?.data && !historyData.data.rows.length && <TableRow><TableCell colSpan={6}>No matching payroll remittance batches.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Button size="sm" variant="outline" disabled={historyQuery.page === 1} onClick={() => setHistoryQuery({ ...historyQuery, page: historyQuery.page - 1 })}>Previous</Button>
        Page {historyQuery.page}
        <Button size="sm" variant="outline" disabled={!historyData?.data?.hasMore} onClick={() => setHistoryQuery({ ...historyQuery, page: historyQuery.page + 1 })}>Next</Button>
      </div>
    </div>}
    {view === "detail" && !batch && !error && <p role="status" className="text-sm">Loading batch…</p>}
    {batch && detail && <>
      <Kv rows={[
        ["Status", labels[batch.state]], ["Payroll cutoff", `${date(batch.cutoff_date)} · Run ${batch.payroll_run_id}`],
        ["Bank receipt", `${peso(batch.bank_amount)} · ${date(batch.bank_date)}`],
        ["Uploaded by", batch.created_name],
        ...(review ? [
          ["Eligible for posting", peso(review.eligibleAmount)], ["Receipt difference", peso(review.difference)],
          ["Exceptions", String(detail.rows.filter(row => row.state !== "READY").length)],
        ] : []),
        ...(posted?.posted_at ? [
          ["Posted", `${posted.posted_name ?? ""} · ${formatDateTime(posted.posted_at + "Z")}`],
          ["Posted amount", peso(posted.posted_amount)], ["Clearing journal", posted.clearing_journal_no ?? "—"],
        ] : []),
        ...(posted?.reversed_at ? [
          ["Reversed", `${posted.reversed_name ?? ""} · ${formatDateTime(posted.reversed_at + "Z")}`],
          ["Reversing journal", posted.reversal_journal_no ?? "—"], ["Reason", posted.reversal_reason ?? "—"],
        ] : []),
      ] as Array<[string, string]>} />
      <div className="max-h-[42dvh] overflow-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Employee / loan</TableHead>
            <TableHead>Deduction</TableHead><TableHead>Reference</TableHead><TableHead>Amount</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
          <TableBody>{detail.rows.map(row => <TableRow key={row.row_number}>
            <TableCell>{row.row_number}</TableCell>
            <TableCell className="whitespace-normal">{row.employee_number || "—"}
              {row.member_name && <span className="block text-xs text-muted-foreground">{row.member_name} {row.loan_no}</span>}
            </TableCell>
            <TableCell>{row.deduction_code || "—"}</TableCell><TableCell className="whitespace-normal break-all">{row.reference || "—"}</TableCell>
            <TableCell>{row.amount ? peso(row.amount) : row.amount_input || "—"}</TableCell>
            <TableCell className="min-w-44 whitespace-normal"><StatusChip status={labels[row.state]} />
              {row.message && <span className="block text-xs text-muted-foreground">{row.message}</span>}
              {"journal_no" in row && row.journal_no && <span className="block text-xs">{row.journal_no}</span>}
              {"reversal_journal_no" in row && row.reversal_journal_no && <span className="block text-xs">Reversal {row.reversal_journal_no}</span>}
            </TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
      {review && (review.canPost ? <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
        <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
        I confirm the bank receipt for {peso(batch.bank_amount)}.
      </label> : <p className="text-sm text-muted-foreground">{review.bankTaken
        ? "This bank receipt has already been used." : "The confirmed bank receipt must equal the total of the ready rows before posting."}</p>)}
      {reverse && <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm">Reverse {peso(reverse.amount)} on {date(reverse.date)} across {reverse.journals.length} linked journals.</p>
        <label className="block space-y-1 text-sm">Reversal reason
          <Textarea required maxLength={500} disabled={busy} value={reason} onChange={event => {
            setReason(event.target.value);
            setKey(newRequestKey());
          }} />
        </label>
      </div>}
    </>}
  </ConsoleDialog>;
}
