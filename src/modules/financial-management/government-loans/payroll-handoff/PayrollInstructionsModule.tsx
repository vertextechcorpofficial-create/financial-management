"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { deductionMonthLabel } from "../enrollment/rules";
import type { Page } from "../requests/types";
import { payrollAcknowledgementTemplate } from "./file-exchange";
import { PayrollInstructionDetails } from "./PayrollInstructionDetails";
import { PayrollResults } from "./PayrollResults";
import { handoffStatusLabels, type PayrollInstructionRow } from "./types";

export function PayrollInstructionsModule() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState<{ key: string; data?: Page<PayrollInstructionRow>; error?: string }>();
  const query = new URLSearchParams({ q: search.trim(), page: String(page), ...(status ? { state: status } : {}) }).toString();
  const key = query + ":" + refresh;
  const current = loaded?.key === key ? loaded : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/fm/government-loans/loans/payroll-instructions?" + query,
          { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message ?? "Could not load Payroll instructions.");
        if (!controller.signal.aborted) setLoaded({ key, data });
      } catch (cause) {
        if (!controller.signal.aborted) setLoaded({ key, error: cause instanceof Error ? cause.message : "Could not load Payroll instructions." });
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, key]);

  return <div className="space-y-4">
    <PayrollResults />
    <h2 className="text-lg font-semibold">Outbound instructions</h2>
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-sm" value={search} maxLength={120} placeholder="Employee, loan, or agency reference"
        aria-label="Search Payroll instructions" onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <NativeSelect aria-label="Filter Payroll instructions by status" value={status}
        onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="">All delivery statuses</option>
        {Object.entries(handoffStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </NativeSelect>
      <Button type="button" variant="outline" onClick={() => setRefresh(value => value + 1)}>Refresh instructions</Button>
    </div>
    {!current && <p role="status" className="text-sm text-muted-foreground">Loading Payroll instructions…</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {current?.error && <p role="alert" className="text-sm text-destructive">{current.error}</p>}
    {current?.data?.items.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No Payroll instructions match.</p>}
    {current?.data?.items.map(item => <details key={item.payload.handoffId} className="rounded-lg border p-3">
      <summary className="cursor-pointer rounded-sm text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <span className="ml-1 font-medium">{item.reference} · {item.employeeName ?? "Employee " + item.payload.employeeId}</span>
        <span className="ml-2 text-muted-foreground">{item.agencyName} · {deductionMonthLabel(item.payload.start.effectiveMonth)}</span>
        <Badge variant="outline" className="ml-2">{handoffStatusLabels[item.state]}</Badge>
      </summary>
      <div className="mt-3 space-y-3 border-t pt-3">
        <PayrollInstructionDetails {...item} />
        {item.fileExchange && (item.state === "QUEUED" || item.state === "RETRYABLE") && <PayrollDownload item={item} onDownloaded={() => {
          setNotice(`${item.reference} · CSV downloaded. Awaiting Payroll acknowledgement.`);
          setRefresh(value => value + 1);
        }} />}
        {item.state !== "ACCEPTED" && <a className="inline-block text-sm text-primary underline" download="payroll-acknowledgement-template.csv"
          href={"data:text/csv;charset=utf-8," + encodeURIComponent(payrollAcknowledgementTemplate(item.payload))}>
          Download acknowledgement template
        </a>}
      </div>
    </details>)}
    {current?.data && (page > 1 || current.data.hasMore) && <nav className="flex flex-wrap justify-end gap-2" aria-label="Payroll instruction pages">
      <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <span className="self-center text-xs">Page {page}</span>
      <Button type="button" size="sm" variant="outline" disabled={!current.data.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
    </nav>}
  </div>;
}

function PayrollDownload({ item, onDownloaded }: { item: PayrollInstructionRow; onDownloaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    key.current ??= consignmentRequestId();
    try {
      const response = await fetch(`/api/fm/government-loans/loans/payroll-instructions/${item.payload.enrollmentId}`, {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({ expectedRevision: item.revision }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "Payroll instructions could not be downloaded.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `payroll-instructions-${item.payload.handoffId}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onDownloaded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payroll instructions could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-2">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="button" size="sm" disabled={busy} onClick={() => void download()}>
      {busy ? "Downloading…" : item.state === "RETRYABLE" ? "Download original CSV for retry" : "Download instructions CSV"}
    </Button>
  </div>;
}
