"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { DetailSkeleton, ListRowsSkeleton } from "../components/ui";
import type { Page } from "../requests/types";
import { EnrollmentApiError, importBatch, importBatches, previewImport, saveImport } from "./api";
import { enrollmentBatchReference, enrollmentCsvHeaders, enrollmentMappingError, paidColumn } from "./import-csv";
import type { EnrollmentImportBatch, EnrollmentImportHistory, EnrollmentImportPreview, EnrollmentImportRow } from "./import-types";

const template = "data:text/csv;charset=utf-8," + encodeURIComponent(enrollmentCsvHeaders.join(",") + "\r\n");
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : "The import service is unavailable. Try again.";

function ImportTotals({ totals }: { totals: EnrollmentImportPreview["totals"] }) {
  return <dl className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-4">
    <div><dt>Ready to import</dt><dd className="font-semibold tabular-nums">{totals.ready}</dd></div>
    <div><dt>Ready with warnings</dt><dd className="font-semibold tabular-nums">{totals.warnings}</dd></div>
    <div><dt>Skipped rows</dt><dd className="font-semibold tabular-nums">{totals.skipped}</dd></div>
    <div><dt>Monthly amortization</dt><dd className="font-semibold tabular-nums">{peso(totals.monthlyAmortization)}</dd></div>
  </dl>;
}

function ImportRows({ rows, loans, onSelect }: {
  rows: EnrollmentImportRow[];
  loans?: EnrollmentImportHistory["loans"];
  onSelect?: (id: number) => void;
}) {
  const byRow = new Map(loans?.map(loan => [loan.rowNumber, loan.id]));
  return <div className="overflow-hidden rounded-lg border">
    <Table aria-label={loans ? "Saved import results" : "CSV row results"}>
      <TableHeader><TableRow>
        <TableHead>Row</TableHead><TableHead>Employee</TableHead><TableHead>Agency / program</TableHead><TableHead>Loan reference</TableHead>
        <TableHead>Amortization</TableHead><TableHead>Paid / total</TableHead><TableHead>Starts</TableHead><TableHead>Result</TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map(row => {
        const id = byRow.get(row.rowNumber);
        return <TableRow key={row.rowNumber}>
          <TableCell>{row.rowNumber}</TableCell><TableCell>{row.employee}</TableCell>
          <TableCell>{row.agency}<span className="block text-xs">{row.program}</span></TableCell>
          <TableCell>{row.reference}{row.payrollLoanId && <span className="block text-xs">Payroll loan {row.payrollLoanId}</span>}</TableCell>
          <TableCell>{row.amortization}</TableCell><TableCell>{row.paid} / {row.installments}</TableCell><TableCell>{row.month}</TableCell>
          <TableCell className="min-w-52 whitespace-normal">
            <span className="font-medium">{row.errors.length ? "Skipped" : loans ? "Imported" : "Ready"}</span>
            {row.errors.length > 0 && <ul className="list-disc pl-4 text-xs text-destructive">
              {row.errors.map(message => <li key={message}>{message}</li>)}
            </ul>}
            {row.warnings.length > 0 && <ul className="list-disc pl-4 text-xs text-muted-foreground">
              {row.warnings.map(message => <li key={message}>{message}</li>)}
            </ul>}
            {id && <Button variant="link" size="sm" className="px-0" type="button" onClick={() => onSelect?.(id)}>
              Open GL-{String(id).padStart(6, "0")}
            </Button>}
          </TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </div>;
}

export function LoanImportDialog({ close, onSaved }: { close: () => void; onSaved: (id: number) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<EnrollmentImportPreview | null>(null);
  const [columns, setColumns] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const attempt = useRef<{ token: string; key: string } | null>(null);
  const reviewed = result?.token && result.columns.every((column, index) => column === columns[index]) ? result : null;

  async function check(next: File, mapping?: number[]) {
    setBusy(true);
    try {
      const checked = await previewImport(next, mapping);
      setResult(checked);
      setColumns(checked.columns);
    } catch (cause) {
      setResult(null);
      toast.error(errorText(cause), { action: { label: "Retry", onClick: () => void check(next) } });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (busy || !file || !reviewed?.token) return;
    if (attempt.current?.token !== reviewed.token) attempt.current = { token: reviewed.token, key: consignmentRequestId() };
    setBusy(true);
    try {
      onSaved((await saveImport(file, columns, reviewed.token, attempt.current.key)).id);
    } catch (cause) {
      if (cause instanceof EnrollmentApiError && cause.preview) {
        setResult(cause.preview);
        setColumns(cause.preview.columns);
      }
      toast.error(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl" showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>Import existing loans</DialogTitle>
        <DialogDescription>Use one row per loan and the employee’s agency statement of account.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block font-medium">Choose CSV file</span>
          <Input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
            const next = event.target.files?.[0];
            setResult(null);
            setProblemsOnly(false);
            attempt.current = null;
            setFile(next ?? null);
            if (next) void check(next);
          }} />
        </label>
        <Button asChild variant="outline"><a href={template} download="government-loan-enrollment-template.csv">Download CSV template</a></Button>
      </div>
      <p className="text-xs text-muted-foreground">Use VOS employee IDs and agency codes from Remittances. Up to 250 rows and 1 MB per file.</p>
      {busy && <p role="status" className="text-sm">{reviewed ? "Saving loan batch…" : "Checking CSV rows…"}</p>}
      {result && file && <>
        <details className="rounded-lg border p-3 text-sm" open={!reviewed || undefined}>
          <summary className="cursor-pointer font-medium">Column mapping</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {enrollmentCsvHeaders.map((label, index) => <label className="space-y-1" key={label}>
              <span className="block font-medium">{label}</span>
              <NativeSelect className="w-full" disabled={busy} value={columns[index] ?? -1} onChange={event => {
                const value = Number(event.target.value);
                setColumns(current => current.map((column, i) => i === index ? value : column));
              }}>
                <option value={-1}>{index === paidColumn ? "Use zero" : "Choose a column"}</option>
                {result.headers.map((header, position) => <option value={position} key={position}>{position + 1} · {header || "Untitled column"}</option>)}
              </NativeSelect>
            </label>)}
          </div>
          {(() => {
            const problem = enrollmentMappingError(columns, result.headers.length);
            return problem || !reviewed ? <div className="mt-3 flex flex-wrap items-center gap-2">
              {problem && <p role="status">{problem}</p>}
              <Button type="button" size="sm" variant="outline" disabled={busy || Boolean(problem)} onClick={() => void check(file, columns)}>Check rows</Button>
            </div> : null;
          })()}
        </details>
        {reviewed && <>
          <ImportTotals totals={reviewed.totals} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={problemsOnly} onChange={event => setProblemsOnly(event.target.checked)} />
            Show only rows with errors or warnings
          </label>
          <ImportRows rows={reviewed.rows.filter(row => !problemsOnly || row.errors.length || row.warnings.length)} />
        </>}
      </>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="button" disabled={busy || !reviewed?.totals.ready} onClick={() => void confirm()}>Import ready rows</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

export function LoanImportHistoryDialog({ initialBatch, close, onSelect }: {
  initialBatch: number | null;
  close: () => void;
  onSelect: (id: number) => void;
}) {
  const [selected, setSelected] = useState(initialBatch);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; list?: Page<EnrollmentImportBatch>; detail?: EnrollmentImportHistory; error?: string }>();
  const key = [selected, page, retry].join(":");
  useEffect(() => {
    const controller = new AbortController();
    const task = selected ? importBatch(selected, controller.signal).then(detail => ({ detail })) :
      importBatches(page, controller.signal).then(list => ({ list }));
    task.then(data => {
      if (!controller.signal.aborted) setState({ key, ...data });
    }).catch(cause => {
      if (!controller.signal.aborted) setState({ key, error: errorText(cause) });
    });
    return () => controller.abort();
  }, [selected, page, key]);
  const current = state?.key === key ? state : undefined;
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl">
      <DialogHeader>
        <DialogTitle>{selected ? enrollmentBatchReference(selected) : "Import history"}</DialogTitle>
        <DialogDescription>{current?.detail ? current.detail.filename : "Existing loans submitted for verification in each batch."}</DialogDescription>
      </DialogHeader>
      {selected && <div><Button type="button" variant="outline" onClick={() => setSelected(null)}>Back to import history</Button></div>}
      {!current && (selected ? <DetailSkeleton /> : <ListRowsSkeleton rows={5} />)}
      {current?.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        {current.error} <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Retry</Button>
      </div>}
      {current?.list && <>
        <Table aria-label="Import batches">
          <TableHeader><TableRow>
            <TableHead>Batch</TableHead><TableHead>File</TableHead><TableHead>Imported</TableHead><TableHead>Skipped</TableHead><TableHead>Submitted by</TableHead><TableHead>Submitted at</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!current.list.items.length && <TableRow><TableCell colSpan={6}>No import batches yet.</TableCell></TableRow>}
            {current.list.items.map(batch => <TableRow key={batch.id}>
              <TableCell><Button type="button" variant="link" className="px-0" onClick={() => setSelected(batch.id)}>{enrollmentBatchReference(batch.id)}</Button></TableCell>
              <TableCell>{batch.filename}</TableCell><TableCell>{batch.totals.ready}</TableCell><TableCell>{batch.totals.skipped}</TableCell>
              <TableCell>{batch.actorName}</TableCell><TableCell>{dateTime(batch.createdAt)} PHT</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
        {(page > 1 || current.list.hasMore) && <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span className="self-center text-xs">Page {page}</span>
          <Button type="button" variant="outline" size="sm" disabled={!current.list.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>}
      </>}
      {current?.detail && <>
        <p className="text-sm">{current.detail.actorName} · {dateTime(current.detail.createdAt)} PHT · Open month {current.detail.openMonth}</p>
        <ImportTotals totals={current.detail.totals} />
        <ImportRows rows={current.detail.rows} loans={current.detail.loans} onSelect={onSelect} />
      </>}
    </DialogContent>
  </Dialog>;
}
