"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { approvalAgencies, approvalDocumentUrl } from "../approval/api";
import { RequestApiError } from "../requests/request-api";
import { RequestSection } from "../requests/RequestReview";
import { requestStatusLabels } from "../requests/types";
import { EnrollmentActivationPanel } from "./EnrollmentActivationPanel";
import { EnrollmentDetails, EnrollmentEvidenceList } from "./EnrollmentDetails";
import { enrollmentBatchReference } from "./import-csv";
import { deductionMonthLabel } from "./rules";
import { bulkVerify, decideVerification, getVerification, listVerification, payrollEvidenceUrl, verificationEvidenceUrl } from "./verification-api";
import { needsImportTransferChoice } from "./verification-rules";
import { verificationStatuses, type BulkVerificationResult, type EnrollmentDecision, type VerificationReview, type VerificationStatus } from "./verification-types";

function useRead<T>(load: ((signal: AbortSignal) => Promise<T>) | null, revision: number, delay = 0) {
  const [state, setState] = useState<{ load: typeof load; revision: number; data?: T; error?: string }>();
  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal).then(data => {
        if (!controller.signal.aborted) setState({ load, revision, data });
      }).catch(cause => {
        if (!controller.signal.aborted) setState({ load, revision, error: cause instanceof Error ? cause.message : "Try loading the enrollments again." });
      });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, revision, delay]);
  return state?.load === load && state.revision === revision ? state : undefined;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message}<Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function VerificationReviewPanel({ review, back, reload, saved }: {
  review: VerificationReview; back: () => void; reload: () => void; saved: (notice: string) => void;
}) {
  const { record, canDecide, checks, payrollWarnings } = review;
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<EnrollmentDecision | null>(null);
  const [error, setError] = useState<{ message: string; conflict: boolean }>();
  const attempt = useRef<{ payload: string; key: string } | null>(null);

  async function decide(decision: EnrollmentDecision) {
    if (pending) return;
    const text = decision === "RETURN" ? reason.trim() : "";
    const payload = JSON.stringify([decision, text]);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: consignmentRequestId() };
    setPending(decision);
    setError(undefined);
    try {
      const result = await decideVerification(record.id, record.request.revision, decision, text, attempt.current.key);
      saved(result.status === "ACTIVE" ? "Enrollment activated. Payroll instructions are ready to download." :
        result.status === "VERIFIED" ? "Enrollment verified. Finish activation from this review." : "Enrollment returned for correction.");
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "The decision could not be saved.",
        conflict: cause instanceof RequestApiError && cause.status === 409 });
    } finally {
      setPending(null);
    }
  }

  const { importTransfer } = record.enrollment;
  return <div className="space-y-4">
    <Button type="button" variant="ghost" disabled={Boolean(pending)} onClick={back}>Back to verification queue</Button>
    <EnrollmentDetails record={record} documentHref={kind => approvalDocumentUrl(record.id, kind)}
      payrollEvidenceHref={revision => payrollEvidenceUrl(record.id, revision)}>
      <EnrollmentActivationPanel review={review} onSaved={saved} reload={reload} />
      <EnrollmentEvidenceList record={record} href={kind => verificationEvidenceUrl(record.id, kind)}
        transferControl={importTransfer !== undefined && <p className="text-sm">Transferred from a previous employer · {importTransfer ? "Yes" : "No"}</p>} />
      {checks.length > 0 && <RequestSection title="Current verification checks">
        <ul className="divide-y text-sm">
          {checks.map(check => <li key={check.label} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
            <Badge variant={check.reason ? "destructive" : "outline"}>{check.reason ? "Needs review" : "Pass"}</Badge>
            <span className="font-medium">{check.label}</span>
            {check.reason && <span className="text-muted-foreground">{check.reason}</span>}
          </li>)}
        </ul>
        {payrollWarnings.length > 0 && <ul aria-label="Payroll warnings" className="list-disc pl-5 text-sm text-muted-foreground">
          {payrollWarnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>}
      </RequestSection>}
      {record.status === "ENROLLED" && !canDecide && <p role="status" className="rounded-lg border p-3 text-sm">
        A different verifier must review this enrollment. The encoder and latest resubmitter cannot decide it.
      </p>}
      {(canDecide || review.canReturnRenewal) && <RequestSection title="Decision">
        {canDecide && <p className="text-sm text-muted-foreground">Verification activates the loan and creates its Payroll instructions.</p>}
        <label className="block space-y-1.5 text-sm">
          <span className="block font-medium">Reason for return</span>
          <Textarea maxLength={500} disabled={Boolean(pending)} value={reason} onChange={event => setReason(event.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        <div className="flex flex-wrap gap-2">
          {canDecide && <Button type="button" disabled={Boolean(pending) || Boolean(error?.conflict) || checks.some(check => check.reason)}
            onClick={() => void decide("VERIFY")}>{pending === "VERIFY" ? "Verifying…" : "Verify enrollment"}</Button>}
          <Button type="button" variant="outline" disabled={Boolean(pending) || Boolean(error?.conflict) || !reason.trim()}
            onClick={() => void decide("RETURN")}>{pending === "RETURN" ? "Returning…" : "Return for correction"}</Button>
          <Button type="button" variant="ghost" disabled={Boolean(pending)} onClick={reload}>Reload review</Button>
        </div>
      </RequestSection>}
    </EnrollmentDetails>
  </div>;
}

export function LoanVerificationModule() {
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [status, setStatus] = useState<VerificationStatus>("ENROLLED");
  const [batch, setBatch] = useState("");
  const [page, setPage] = useState(1);
  const [openRecord, selectRecord] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [revision, refresh] = useState(0);
  const [agencyRevision, refreshAgencies] = useState(0);
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [results, setResults] = useState<BulkVerificationResult | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const batchId = /^(?:BT-)?0*([1-9]\d{0,9})$/i.exec(batch.trim())?.[1];
  const invalidBatch = Boolean(batch.trim() && !batchId);
  const query = new URLSearchParams({ q: search.trim(), page: String(page), status,
    ...(agency ? { agency } : {}), ...(batchId ? { batch: batchId } : {}) }).toString();
  const loadQueue = useCallback((signal: AbortSignal) => listVerification(query, signal), [query]);
  const loadReview = useCallback((signal: AbortSignal) => getVerification(openRecord!, signal), [openRecord]);
  const queue = useRead(openRecord === null && !invalidBatch ? loadQueue : null, revision, 180);
  const review = useRead(openRecord === null ? null : loadReview, revision);
  const agencies = useRead(approvalAgencies, agencyRevision);
  const reload = () => refresh(value => value + 1);
  const filterChanged = () => { setPage(1); setSelected([]); setResults(null); setNotice(""); };
  const items = queue?.data?.items ?? [];
  const selections = items.filter(item => item.canDecide && selected.includes(item.id)).map(item => ({ id: item.id, expectedRevision: item.revision }));

  async function verifySelected() {
    if (working || !selections.length) return;
    const payload = JSON.stringify(selections);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: consignmentRequestId() };
    setWorking(true);
    setBulkError("");
    try {
      setResults(await bulkVerify(selections, attempt.current.key));
      attempt.current = null;
      setSelected([]);
      setConfirming(false);
      reload();
    } catch (cause) {
      setBulkError(cause instanceof Error ? cause.message : "The batch could not be completed. Try again.");
    } finally {
      setWorking(false);
    }
  }

  const back = () => { selectRecord(null); setSelected([]); setNotice(""); reload(); };
  if (openRecord !== null) return <div className="space-y-3">
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {review?.data ? <VerificationReviewPanel key={`${openRecord}:${revision}`} review={review.data} back={back} reload={reload}
      saved={message => { setNotice(message); reload(); }} /> : <>
      <Button type="button" variant="ghost" onClick={back}>Back to verification queue</Button>
      {review?.error ? <LoadError message={review.error} retry={reload} /> : <p role="status" className="text-sm text-muted-foreground">Loading verification review…</p>}
    </>}
  </div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{requestStatusLabels[status]}</h2>
      {status === "ENROLLED" && <Button type="button" disabled={!selections.length} onClick={() => { setBulkError(""); setConfirming(true); }}>
        Verify selected{selections.length ? ` (${selections.length})` : ""}
      </Button>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-sm" aria-label="Search verification queue" placeholder="Employee, loan, or agency reference" maxLength={120}
        value={search} onChange={event => { setSearch(event.target.value); filterChanged(); }} />
      <NativeSelect aria-label="Filter verification by status" value={status}
        onChange={event => { setStatus(event.target.value as VerificationStatus); filterChanged(); }}>
        {verificationStatuses.map(item => <option value={item} key={item}>{requestStatusLabels[item]}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Filter verification by agency" value={agency} onChange={event => { setAgency(event.target.value); filterChanged(); }}>
        <option value="">All agencies</option>
        {agencies?.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      <Input className="max-w-48" aria-label="Filter verification by import batch" placeholder="Import batch reference" maxLength={22}
        aria-invalid={invalidBatch} value={batch} onChange={event => { setBatch(event.target.value); filterChanged(); }} />
      <Button type="button" variant="outline" onClick={() => { setSelected([]); reload(); }}>Refresh queue</Button>
    </div>
    {agencies?.error && <LoadError message={agencies.error} retry={() => refreshAgencies(value => value + 1)} />}
    {invalidBatch && <p role="status" className="text-sm text-muted-foreground">Enter a batch number or its reference, such as BT-0001.</p>}
    {queue?.error && <LoadError message={queue.error} retry={reload} />}
    {!queue && !invalidBatch && <p role="status" className="text-sm text-muted-foreground">Loading verification queue…</p>}
    {results && <RequestSection title="Bulk verification results">
      <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
        <span>{results.verified} verified · {results.skipped} skipped</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setResults(null)}>Dismiss results</Button>
      </div>
      <ul className="divide-y text-sm">
        {results.items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2 py-1">
          <Button type="button" variant="link" className="px-0" size="sm" onClick={() => selectRecord(item.id)}>{item.reference}</Button>
          <Badge variant="outline">{item.outcome === "verified" ? "Verified" : "Skipped"}</Badge>
          {item.reason && <span>{item.reason}</span>}
        </li>)}
      </ul>
    </RequestSection>}
    {queue?.data && <>
      <p className="text-sm text-muted-foreground">{queue.data.openMonth ? "Open month " + deductionMonthLabel(queue.data.openMonth) : "Open month unavailable"}</p>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader><TableRow>
            {status === "ENROLLED" && <TableHead className="w-10">Select</TableHead>}<TableHead>Loan</TableHead><TableHead>Employee</TableHead>
            <TableHead>Agency / program</TableHead><TableHead className="text-right">Amortization</TableHead>
            <TableHead>First deduction</TableHead><TableHead>Prepared by</TableHead><TableHead>Evidence</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!items.length && <TableRow><TableCell colSpan={status === "ENROLLED" ? 8 : 7}
              className="py-8 text-center text-muted-foreground">No enrollments match these filters.</TableCell></TableRow>}
            {items.map(item => <TableRow key={item.id}>
              {status === "ENROLLED" && <TableCell><Checkbox aria-label={`Select ${item.reference}`} checked={selected.includes(item.id)} disabled={!item.canDecide}
                onCheckedChange={checked => setSelected(ids => checked === true ? [...ids, item.id] : ids.filter(id => id !== item.id))} /></TableCell>}
              <TableCell>
                <Button type="button" variant="link" size="sm" className="px-0" onClick={() => selectRecord(item.id)}>{item.reference}</Button>
                <span className="block max-w-56 truncate text-xs text-muted-foreground" title={item.enrollment.agencyReference}>{item.enrollment.agencyReference}</span>
                {item.importBatchId && <span className="block text-xs text-muted-foreground">{enrollmentBatchReference(item.importBatchId)}</span>}
              </TableCell>
              <TableCell>{item.employeeName ?? "—"}</TableCell>
              <TableCell>{item.agencyName ?? "—"}<span className="block text-xs text-muted-foreground">{item.program}</span></TableCell>
              <TableCell className="text-right tabular-nums">{peso(item.enrollment.monthlyAmortization)}</TableCell>
              <TableCell>{deductionMonthLabel(item.enrollment.firstDeductionMonth)}</TableCell>
              <TableCell>
                {item.enrollment.resubmittedBy?.name ?? item.enrollment.encodedBy.name}
                <span className="block text-xs text-muted-foreground">{dateTime(item.enrollment.resubmittedAt ?? item.enrollment.encodedAt)} PHT</span>
                {status === "ENROLLED" && !item.canDecide && <span className="block text-xs text-muted-foreground">Different verifier required</span>}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{item.documentsPresent} / {item.documentsRequired} documents</Badge>
                {needsImportTransferChoice(item.enrollment) && <span className="block text-xs text-muted-foreground">Transfer status required</span>}
                {item.enrollment.externalReferenceCheck === "NEEDS_SOURCE" && <span className="block text-xs text-muted-foreground">Payroll mapping pending</span>}
                {Boolean(item.enrollment.payrollWarnings?.length) && <span className="block text-xs text-muted-foreground">Payroll warnings</span>}
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      {(page > 1 || queue.data.hasMore) && <nav className="flex flex-wrap justify-end gap-2" aria-label="Verification queue pages">
        <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => { setSelected([]); setPage(page - 1); }}>Previous</Button>
        <span className="self-center text-xs">Page {page}</span>
        <Button type="button" variant="outline" size="sm" disabled={!queue.data.hasMore} onClick={() => { setSelected([]); setPage(page + 1); }}>Next</Button>
      </nav>}
    </>}
    <AlertDialog open={confirming} onOpenChange={value => { if (!working) setConfirming(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Verify selected enrollments?</AlertDialogTitle>
          <AlertDialogDescription>{selections.length} selected. Passing enrollments become active and receive Payroll instructions. Each skip includes its reason.</AlertDialogDescription>
        </AlertDialogHeader>
        {bulkError && <p role="alert" className="text-sm text-destructive">{bulkError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <Button type="button" disabled={working || !selections.length} onClick={() => void verifySelected()}>{working ? "Verifying…" : "Verify enrollments"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
