"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { useLifecycleCommand, useLifecycleRead } from "../../loans/lifecycle-client";
import type { getBillingContext, previewAgencyBilling, viewAgencyBilling } from "../../server/agency-billing";
import { billingHeaders, billingMaxBytes } from "./csv";
import type { BillingReason, BillingRow } from "./reconcile";

const endpoint = "/api/fm/government-loans/remittances/billing";
type Context = Awaited<ReturnType<typeof getBillingContext>>;
type View = Extract<Awaited<ReturnType<typeof viewAgencyBilling>>, { rows: BillingRow[] }>;
type Preview = Awaited<ReturnType<typeof previewAgencyBilling>>;

const money = (value: string | null) => value === null ? "—" : peso(value);
const reasonText: Record<BillingReason["code"], string> = {
  UNENROLLED: "Loan reference is missing from enrollment",
  UNVERIFIED: "Enrollment is awaiting verification",
  AMBIGUOUS_REFERENCE: "Multiple enrollments share this agency reference",
  FAILED: "Payroll reported a failed deduction",
  PARTIAL: "Partial deduction · Shortfall",
  CATCH_UP: "Includes catch-up",
  FINAL_PAY: "Final pay",
  AMORTIZATION_DIFFERS: "Amortization differs from agency billing",
  MISSING_BILLING: "Deduction is missing from the billing file",
  NO_DEDUCTION: "No deduction reported for this billed loan",
  MISSING_LOAN_REFERENCE: "Payroll result has no matching loan reference",
};
function ComparisonTable({ rows, mode }: { rows: BillingRow[]; mode: "actual" | "projected" }) {
  return <div className="rounded-md border"><Table>
    <TableHeader><TableRow>
      {["Loan reference", "Employee", "Billed", mode === "actual" ? "Withheld" : "Projected", "Difference", "Reason"].map(label =>
        <TableHead key={label}>{label}</TableHead>)}
    </TableRow></TableHeader>
    <TableBody>{rows.map(row => <TableRow key={row.key}>
      <TableCell>{row.loanReference ?? "—"}{row.systemReference && <p className="text-xs text-muted-foreground">{row.systemReference}</p>}</TableCell>
      <TableCell>{row.billedName ?? row.employee ?? "—"}
        {row.billedName && row.employee && row.billedName !== row.employee &&
          <p className="text-xs text-muted-foreground">VOS employee {row.employee}</p>}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{money(row.billed)}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{money(row.deduction)}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{row.difference && !row.difference.startsWith("-") && row.difference !== "0.00" && "+"}{money(row.difference)}</TableCell>
      <TableCell className="whitespace-normal">
        {row.reasons.length ? row.reasons.map((reason, index) => <p key={reason.code + ":" + index} className="text-xs">
          {reason.code === "NO_DEDUCTION" && mode === "projected" ? "No deduction scheduled" : reasonText[reason.code]}
          {reason.amount && reason.code !== "FAILED" && " " + peso(reason.amount)}
        </p>) : "Matched"}
      </TableCell>
    </TableRow>)}
      {!rows.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No rows in this view.</TableCell></TableRow>}
    </TableBody>
  </Table></div>;
}

function BillingImport({ agencyId, month, replacement, close, onSaved }: {
  agencyId: number; month: string; replacement: boolean; close: () => void; onSaved: () => void;
}) {
  const [file, setFile] = useState<{ name: string; csv: string; size: number }>();
  const [preview, setPreview] = useState<Preview>();
  const [columns, setColumns] = useState<number[]>();
  const [reason, setReason] = useState("");
  const [fileError, setFileError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const readCounter = useRef(0);
  const command = useLifecycleCommand();
  const input = file ? { agencyId, month, fileName: file.name, csv: file.csv, columns } : null;
  const sample = billingHeaders.join(",") + "\r\nGL-000000,Juan Dela Cruz,1000.00\r\n";

  async function readSelected(selected: File | undefined) {
    const run = ++readCounter.current;
    setFile(undefined); setPreview(undefined); setColumns(undefined); setFileError(""); setDirty(false);
    if (!selected) return;
    if (!/\.csv$/i.test(selected.name) || selected.size > billingMaxBytes) {
      setFileError("Choose a CSV up to 1 MB.");
      return;
    }
    try {
      const csv = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await selected.arrayBuffer());
      if (run === readCounter.current) setFile({ name: selected.name, csv, size: selected.size });
    } catch {
      if (run === readCounter.current) setFileError("Save the file as a UTF-8 CSV and try again.");
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    await readSelected(event.target.files?.[0]);
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    void readSelected(event.dataTransfer.files?.[0]);
  }

  function inspect() {
    if (!input) return;
    setDirty(true);
    return command.run(endpoint + "/import?preview=1", input, async response => {
      const data = await response.json() as Preview;
      setColumns(data.columns.length ? data.columns : undefined);
      setPreview(data);
      setDirty(false);
    });
  }

  function importBilling() {
    if (!input || !preview?.token || dirty) return;
    return command.run(endpoint + "/import", { ...input, token: preview.token, reason }, onSaved);
  }

  const replacing = !!(preview?.current || replacement) && !preview?.replay;
  const hint = !file ? "Choose a CSV to enable preview."
    : !preview ? "Preview the CSV to enable import."
      : dirty ? "Preview again after changing columns."
        : replacing && !reason.trim() ? "Enter a replacement reason."
          : null;
  return <Dialog open onOpenChange={open => { if (!open && !command.busy) close(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{replacement ? "Replace agency billing" : "Import agency billing"}</DialogTitle>
        <DialogDescription>Payroll month {month}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto px-1">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className={"flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm transition-colors " +
            (dragOver ? "border-primary bg-muted/40" : "hover:bg-muted/20")}
            onDragOver={event => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)} onDrop={drop}>
            <span className="font-medium">Choose a billing CSV or drop it here</span>
            <span className="text-xs text-muted-foreground">UTF-8, up to 1 MB. Required columns: {billingHeaders.join(", ")}.</span>
            <Input className="sr-only" type="file" accept=".csv,text/csv" disabled={command.busy} aria-required="true"
              onChange={event => void readFile(event)} />
          </label>
          <Button asChild variant="outline" size="sm"><a download="agency-billing-template.csv"
            href={"data:text/csv;charset=utf-8," + encodeURIComponent(sample)}>Download sample CSV</a></Button>
        </div>
        {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>}
        {preview?.headers.length ? <div className="space-y-2">
          <p className="text-sm font-medium">Map billing columns</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {billingHeaders.map((label, index) => <label key={label} className="text-sm">{label}
              <NativeSelect aria-label={label + " CSV column"} value={columns?.[index] ?? -1} disabled={command.busy} onChange={event => {
                setColumns((columns ?? [-1, -1, -1]).map((value, i) => i === index ? Number(event.target.value) : value));
                setDirty(true);
              }}>
                <option value={-1}>Choose column</option>
                {preview.headers.map((header, i) => <option key={i} value={i}>{header || "Column " + (i + 1)}</option>)}
              </NativeSelect>
            </label>)}
          </div>
        </div> : null}
        {!dirty && preview?.issues.length ? <div role="alert" className="space-y-1 text-sm text-destructive">
          <p>{preview.issueCount} import issue(s)</p>
          <ul className="max-h-32 list-disc overflow-y-auto pl-5">
            {preview.issues.map((issue, index) => <li key={index}>{issue.rowNumber && "Row " + issue.rowNumber + " · "}{issue.message}</li>)}
          </ul>
        </div> : null}
        {!dirty && preview?.preview && <>
          <p className="text-sm">{preview.rowCount} billing row(s) · Billed {money(preview.preview.totals.billed)} · {
            preview.preview.mode === "actual" ? "Withheld" : "Projected"} {money(preview.preview.totals.deduction)}</p>
          {preview.replay && <p role="status" className="text-sm">This file is already the current billing.</p>}
          <ComparisonTable rows={preview.preview.rows} mode={preview.preview.mode} />
          {replacing && <label className="block text-sm">Replacement reason <span className="text-destructive" aria-hidden>*</span>
            <Textarea required maxLength={500} value={reason} disabled={command.busy} aria-required="true" onChange={event => setReason(event.target.value)} />
          </label>}
        </>}
        {(fileError || command.error) && <p role="alert" className="text-sm text-destructive">{fileError || command.error}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{hint}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={command.busy}>Cancel</Button>
          <Button variant="outline" onClick={() => void inspect()} disabled={!file || command.busy}>Preview CSV</Button>
          <Button onClick={() => void importBilling()} disabled={command.busy || dirty || !preview?.token || preview.replay || replacing && !reason.trim()}>
            {replacing ? "Replace billing" : "Confirm import"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

export function AgencyBillingModule() {
  const [agency, setAgency] = useState("");
  const [selectedMonth, setMonth] = useState("");
  const [issues, setIssues] = useState(false);
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState("");
  const skipUrlWrite = useRef(true);
  const context = useLifecycleRead<Context>(endpoint, reload);
  const agencyId = agency || String(context?.data?.agencies[0]?.id ?? "");
  const latest = context?.data?.latestMonths?.[String(agencyId)];
  const month = selectedMonth || latest || context?.data?.openMonth || "";
  const query = new URLSearchParams({ agencyId, month, page: String(page), historyPage: String(historyPage), ...(issues ? { issues: "1" } : {}) });
  const view = useLifecycleRead<View>(agencyId && month ? endpoint + "?" + query : null, reload);
  const refresh = () => setReload(value => value + 1);
  const reset = () => { setPage(1); setHistoryPage(1); setNotice(""); };
  const error = context?.error || view?.error;
  const data = view?.data;

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      setAgency(params.get("billingAgency") ?? "");
      setMonth(params.get("billingMonth") ?? "");
      setIssues(params.get("billingIssues") === "1");
      setPage(Math.max(1, Number(params.get("billingPage")) || 1));
    };
    syncFromLocation();
    skipUrlWrite.current = true;
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (skipUrlWrite.current) { skipUrlWrite.current = false; return; }
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => value ? params.set(key, value) : params.delete(key);
    setOrDelete("billingAgency", agency);
    setOrDelete("billingMonth", selectedMonth);
    setOrDelete("billingIssues", issues ? "1" : "");
    setOrDelete("billingPage", page > 1 ? String(page) : "");
    const search = params.toString();
    const target = window.location.pathname + (search ? "?" + search : "") + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (target !== current) window.history.replaceState(window.history.state, "", target);
  }, [agency, selectedMonth, issues, page]);

  return <section className="space-y-3" aria-label="Agency billing reconciliation">
    <h2 className="text-lg font-semibold">Billing reconciliation</h2>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">Agency <NativeSelect aria-label="Agency" value={agencyId}
          onChange={event => { setAgency(event.target.value); reset(); }}>
          {context?.data?.agencies.length ? context.data.agencies.map(item =>
            <option key={item.id} value={item.id}>{item.code} · {item.name}</option>) : <option value="">Choose agency</option>}
        </NativeSelect></label>
        <label className="space-y-1 text-sm">Payroll month <Input type="month" value={month} onChange={event => {
          setMonth(event.target.value); reset();
        }} /></label>
        {data?.billingRevision && <label className="flex items-center gap-2 self-end py-2 text-sm">
          <input type="checkbox" checked={issues} onChange={event => { setIssues(event.target.checked); setPage(1); }} />Differences only
        </label>}
      </div>
      <div className="flex flex-wrap gap-2">
        {data && <Button variant="outline" onClick={refresh}>Refresh</Button>}
        {data?.canImport && <Button onClick={() => setShowImport(true)}>{data.billingRevision ? "Replace billing" : "Import billing"}</Button>}
      </div>
    </div>
    {error && <div role="alert" className="flex items-center gap-2 text-sm text-destructive">{error}
      <Button variant="outline" size="sm" onClick={refresh}>Retry</Button></div>}
    {!error && (!context?.data || agencyId && !data) && <p role="status" className="text-sm text-muted-foreground">Loading billing…</p>}
    {context?.data && !context.data.agencies.length && <div className="flex flex-wrap items-center gap-2 rounded-md border p-4 text-sm">
      <p className="text-muted-foreground">No agencies are configured to send billing.</p>
      <Button asChild variant="outline" size="sm"><Link href="/fm/government-loans/remittances?tab=agencies">Add an agency</Link></Button>
    </div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {data && <>
      {data.billingRevision ? <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
        <span>{data.mode === "actual" ? "Actual withholding" : "Projected · Awaiting Payroll"}</span>
        <span>Billed {money(data.totals.billed)}</span>
        <span>{data.mode === "actual" ? "Withheld" : "Projected"} {money(data.totals.deduction)}</span>
        <span>Difference {money(data.totals.difference)}</span>
        {data.totals.discrepancies > 0
          ? <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { setIssues(true); setPage(1); }}>
            {data.totals.discrepancies} row(s) to review
          </Button>
          : <span className="text-muted-foreground">No differences</span>}
        {issues && <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { setIssues(false); setPage(1); }}>Show all rows</Button>}
      </div> : <div className="space-y-2 rounded-md border border-dashed p-4">
        <p className="font-medium">No agency bill for {month}.</p>
        <p className="text-sm text-muted-foreground">Projected withholding {money(data.totals.deduction)}. Import the agency CSV to reconcile it against Payroll.</p>
        <div className="flex flex-wrap gap-2">
          {data.canImport && <Button onClick={() => setShowImport(true)}>Import billing</Button>}
          {latest && latest !== month && <Button variant="outline" onClick={() => { setMonth(latest); reset(); }}>View latest billing ({latest})</Button>}
        </div>
      </div>}
      {data.billingRevision ? <>
        <p className="text-sm text-muted-foreground">{data.billingRevision.fileName} · Revision {data.billingRevision.number}
          {data.payrollReceipt && " · Payroll receipt revision " + data.payrollReceipt.revision}</p>
        <ComparisonTable rows={data.rows} mode={data.mode} />
        {(page > 1 || data.hasMore) && <nav aria-label="Billing pages" className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span className="text-sm">Page {page} · {data.rowCount} row(s)</span>
          <Button variant="outline" size="sm" disabled={!data.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
        </nav>}
      </> : null}
      {data.history.length > 0 && <details className="space-y-2 rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Import history ({data.history.length}{data.historyHasMore ? "+" : ""})</summary>
        <ul className="space-y-1">{data.history.map(revision => <li key={revision.id}>
          Revision {revision.number} · {revision.fileName} · {revision.rowCount} row(s) · {revision.uploadedBy}
          {" · "}{dateTime(revision.uploadedAt)} PHT {revision.reason && " · " + revision.reason}
        </li>)}</ul>
        {(historyPage > 1 || data.historyHasMore) && <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={historyPage === 1} onClick={() => setHistoryPage(value => value - 1)}>Newer imports</Button>
          <Button variant="outline" size="sm" disabled={!data.historyHasMore} onClick={() => setHistoryPage(value => value + 1)}>Older imports</Button>
        </div>}
      </details>}
      {showImport && data.canImport && <BillingImport agencyId={Number(agencyId)} month={month} replacement={!!data.billingRevision}
        close={() => setShowImport(false)} onSaved={() => { setShowImport(false); reset(); setNotice("Agency billing saved."); refresh(); }} />}
    </>}
  </section>;
}
