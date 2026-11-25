"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { centavos } from "./contract";
import { amountFromCentavos } from "../loans/position";
import type { PayrollMonthView, PayrollReceiptPreview, ReceiptSummary } from "../loans/monthly-payroll";

const endpoint = "/api/fm/government-loans/loans/payroll-results";
const labels = { D: "Deducted in full", P: "Partial deduction", F: "Failed deduction", X: "Final pay" } as const;

async function responseData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Could not load Payroll results. Try again.");
  return data;
}

function PayrollReceipt({ view, refresh }: { view: PayrollMonthView; refresh: () => void }) {
  const [preview, setPreview] = useState<PayrollReceiptPreview>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const pending = useRef(false);

  async function inspect() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setPreview(undefined);
    key.current = null;
    try {
      setPreview(await responseData<PayrollReceiptPreview>(endpoint + "/receipt?" + new URLSearchParams({ month: view.month })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not preview the Payroll receipt.");
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  async function confirm() {
    if (!preview || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    key.current ??= consignmentRequestId();
    try {
      await responseData<ReceiptSummary>(endpoint + "/receipt", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({ month: view.month, token: preview.token, reason }),
      });
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not confirm the Payroll receipt.");
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  const agencyName = (id: number) => view.agencies.find(agency => agency.id === id)?.name ?? "Agency #" + id;
  return <div className="space-y-2 rounded-md border p-3 text-sm">
    <p role="status" className="font-medium">{view.receipt
      ? "Payroll received · Revision " + view.receipt.revision + " · " + dateTime(view.receipt.receivedAt) + " PHT"
      : "Awaiting Payroll"}</p>
    {view.remittable && <p>{view.remittable.length
      ? view.remittable.map(total => agencyName(total.agencyId) + " " + peso(total.amount)).join(" · ")
      : "No withholding in the confirmed receipt."}</p>}
    {view.receiptHistory.length > 1 && <details>
      <summary className="cursor-pointer">Receipt history</summary>
      <ul className="ml-4 list-disc">
        {view.receiptHistory.map(receipt => <li key={receipt.id}>Revision {receipt.revision} · {dateTime(receipt.receivedAt)} PHT
          {receipt.reason && " · " + receipt.reason}</li>)}
      </ul>
    </details>}
    {view.month === view.openMonth && (view.contractReady
      ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void inspect()}>{busy ? "Working…" : "Preview Payroll receipt"}</Button>
      : <p className="text-muted-foreground">Receipt confirmation requires approved Payroll coverage for this month.</p>)}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {preview && <div className="space-y-2 rounded-md border p-2">
      <p>Payroll runs {preview.runIds.map(id => "#" + id).join(", ")} · {preview.count} loan result(s)</p>
      {preview.totals.map(total => <p key={total.agencyId}>{agencyName(total.agencyId)} · {peso(total.amount)} withheld</p>)}
      {preview.issues.length > 0 && <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-destructive">
        {preview.issues.map(issue => <li key={issue}>{issue}</li>)}
      </ul>}
      {preview.replay && <p>These Payroll results are already confirmed.</p>}
      {!preview.issues.length && !preview.replay && <>
        {preview.receipt && <label className="block space-y-1">
          <span>Correction reason</span>
          <Textarea value={reason} maxLength={500} disabled={busy} onChange={event => { key.current = null; setReason(event.target.value); }} />
        </label>}
        <Button size="sm" disabled={busy || (!!preview.receipt && !reason.trim())} onClick={() => void confirm()}>
          {preview.receipt ? "Confirm correction" : "Confirm Payroll receipt"}
        </Button>
      </>}
    </div>}
  </div>;
}

export function PayrollResults() {
  const [month, setMonth] = useState("");
  const [agency, setAgency] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data?: PayrollMonthView; error?: string }>();
  const query = new URLSearchParams({ page: String(page), q: search.trim(), ...(month ? { month } : {}), ...(agency ? { agency } : {}) }).toString();
  const key = query + ":" + refresh;
  const data = loaded?.key === key ? loaded.data : undefined;
  const error = loaded?.key === key ? loaded.error : undefined;
  const reload = () => setRefresh(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void responseData<PayrollMonthView>(endpoint + "?" + query, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setLoaded({ key, data }); })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setLoaded({ key, error: error instanceof Error ? error.message : "Could not load Payroll results." });
        });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, query]);

  return <section className="space-y-3" aria-label="Monthly Payroll results">
    <h2 className="text-lg font-semibold">Monthly deductions</h2>
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1 text-sm"><span>Payroll month</span>
        <Input type="month" value={month || loaded?.data?.month || ""} onChange={event => {
          setMonth(event.target.value); setAgency(""); setPage(1);
        }} />
      </label>
      <Input className="max-w-xs" aria-label="Find a loan or employee" placeholder="Loan or employee" maxLength={120} value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <NativeSelect aria-label="Filter deductions by agency" value={agency} onChange={event => { setAgency(event.target.value); setPage(1); }}>
        <option value="">All agencies</option>
        {loaded?.data?.agencies.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </NativeSelect>
      {data && <Button asChild variant="outline"><a href={endpoint + "?" + query + "&format=csv"}>Download expected deductions</a></Button>}
    </div>
    {error ? <div role="alert" className="flex items-center gap-2 text-sm text-destructive">{error}
      <Button size="sm" variant="outline" onClick={reload}>Retry</Button></div>
      : !data && <p role="status" className="text-sm text-muted-foreground">Loading Payroll deductions…</p>}
    {data && <>
      <PayrollReceipt key={key} view={data} refresh={reload} />
      <div className="rounded-md border"><Table>
        <TableHeader><TableRow>
          {["Loan / Employee", "Agency", "Expected", "Withheld", "Result", "Payroll evidence"].map(label => <TableHead key={label}>{label}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {data.rows.map(row => <TableRow key={row.loanId}>
            <TableCell>{row.reference}<p className="text-xs text-muted-foreground">{row.employee}</p></TableCell>
            <TableCell>{row.agency}</TableCell>
            <TableCell>{peso(row.expected)}{row.provisional && <p className="text-xs text-muted-foreground">Provisional</p>}</TableCell>
            <TableCell>{row.results.length ? peso(amountFromCentavos(row.results.reduce((total, result) => total + centavos(result.amount), 0n))) : "—"}</TableCell>
            <TableCell>{row.results.length ? row.results.map(result => <p key={result.status}>
              {result.status} · {labels[result.status]}
              {(result.status === "P" || result.status === "F" || result.status === "X") &&
                <span className="block text-xs text-muted-foreground">
                  {result.status === "X" ? "Unpaid" : "Short"} {peso(amountFromCentavos(centavos(result.expected) - centavos(result.amount)))}
                </span>}
            </p>) : row.expected === "0.00" ? "No deduction scheduled" : "Awaiting Payroll"}</TableCell>
            <TableCell>{row.results.flatMap(result => result.evidence.map(source => <p key={result.status + ":" + source.runId} className="text-xs">
              {source.cutoff} · Run #{source.runId} · Employee result #{source.employeeResultId}
              <span className="block text-muted-foreground">{source.itemId ? "Item #" + source.itemId + " · " : ""}{source.reference}</span>
            </p>))}</TableCell>
          </TableRow>)}
          {!data.rows.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No loans match these filters.</TableCell></TableRow>}
        </TableBody>
      </Table></div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{data.total} loan(s)</span>
        {(page > 1 || data.hasMore) && <nav className="flex items-center gap-2" aria-label="Payroll deduction pages">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page}</span>
          <Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>}
      </div>
    </>}
  </section>;
}
