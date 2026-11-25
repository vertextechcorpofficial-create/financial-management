"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { peso } from "@/modules/financial-management/cooperative/members/format";
import { agencyOptions, requestDocumentUrl } from "../requests/request-api";
import { requestStatusLabels, type AgencyChoice, type EmployeeChoice } from "../requests/types";
import { getEnrollment, listEnrollments } from "./api";
import { EnrollmentDetails } from "./EnrollmentDetails";
import { EnrollmentEditor } from "./EnrollmentEditor";
import { EnrollmentEvidenceEditor } from "./EnrollmentEvidenceEditor";
import { LoanImportDialog, LoanImportHistoryDialog } from "./LoanImportsDialog";
import { deductionMonthLabel } from "./rules";
import type { EnrollmentDetail, EnrollmentPage } from "./types";

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message}<Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

export function LoanEnrollmentModule({ transferEmployee }: { transferEmployee?: EmployeeChoice } = {}) {
  const [importView, setImportView] = useState<"upload" | "history" | null>(null);
  const [importedBatch, setImportedBatch] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | "new" | null>(transferEmployee ? "new" : null);
  const [initialTransfer, setInitialTransfer] = useState(transferEmployee);
  const [correcting, setCorrecting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [agency, setAgency] = useState("");
  const [page, setPage] = useState(1);
  const [listAttempt, reloadList] = useState(0);
  const [detailAttempt, reloadDetail] = useState(0);
  const [agencyAttempt, reloadAgencies] = useState(0);
  const [list, setList] = useState<{ key: string; data?: EnrollmentPage; error?: string }>();
  const [detail, setDetail] = useState<{ key: string; data?: EnrollmentDetail; error?: string }>();
  const [agencies, setAgencies] = useState<{ items: AgencyChoice[]; error?: string }>({ items: [] });
  const [notice, setNotice] = useState("");
  const query = new URLSearchParams({ q: search.trim(), page: String(page) });
  if (status) query.set("status", status);
  if (agency) query.set("agency", agency);
  const serialized = query.toString();
  const listKey = serialized + ":" + listAttempt;
  const detailKey = selected + ":" + detailAttempt;
  const current = list?.key === listKey ? list : undefined;
  const record = detail?.key === detailKey ? detail : undefined;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const items: AgencyChoice[] = [];
      for (let page = 1; ; page++) {
        const batch = await agencyOptions(page, controller.signal);
        items.push(...batch.items);
        if (!batch.hasMore) break;
      }
      if (!controller.signal.aborted) setAgencies({ items });
    }
    void load().catch(error => {
      if (!controller.signal.aborted) setAgencies({ items: [], error: error instanceof Error ? error.message : "Could not load agencies." });
    });
    return () => controller.abort();
  }, [agencyAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      listEnrollments(serialized, controller.signal).then(data => {
        if (!controller.signal.aborted) setList({ key: listKey, data });
      }).catch(error => {
        if (!controller.signal.aborted) setList({ key: listKey, error: error instanceof Error ? error.message : "Could not load enrollments." });
      });
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [serialized, listKey]);

  useEffect(() => {
    if (typeof selected !== "number") return;
    const controller = new AbortController();
    getEnrollment(selected, controller.signal).then(data => {
      if (!controller.signal.aborted) setDetail({ key: detailKey, data });
    }).catch(error => {
      if (!controller.signal.aborted) setDetail({ key: detailKey, error: error instanceof Error ? error.message : "Could not load the enrollment." });
    });
    return () => controller.abort();
  }, [selected, detailKey]);

  const back = () => { setSelected(null); setCorrecting(false); setNotice(""); setInitialTransfer(undefined); };
  const refreshMonth = () => reloadList(value => value + 1);
  const agencyError = agencies.error && <LoadError message={agencies.error} retry={() => reloadAgencies(value => value + 1)} />;
  if (selected !== null) {
    const value = record?.data;
    if (selected === "new" || value?.status === "APPROVED" || value?.status === "RETURNED" && correcting) return <div className="space-y-3">
      {agencyError}
      <EnrollmentEditor key={detailKey} record={value} transferEmployee={selected === "new" ? initialTransfer : undefined}
        agencies={agencies.items} openMonth={list?.data?.openMonth ?? null}
        onBack={correcting ? () => setCorrecting(false) : back} onReload={() => reloadDetail(count => count + 1)}
        refreshMonth={refreshMonth} onSaved={result => {
          setNotice(correcting ? "Enrollment resubmitted for verification." :
            result.status === "ENROLLED" ? "Enrollment saved for verification." : "Agency decline recorded.");
          setCorrecting(false);
          setInitialTransfer(undefined);
          setSelected(result.id);
          reloadDetail(count => count + 1);
          refreshMonth();
        }} />
    </div>;
    return <div className="space-y-3">
      <Button type="button" variant="ghost" onClick={back}>Back to enrollment</Button>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {record?.error && <LoadError message={record.error} retry={() => reloadDetail(value => value + 1)} />}
      {!record && <p role="status" className="text-sm text-muted-foreground">Loading enrollment…</p>}
      {value && <EnrollmentDetails record={value} documentHref={kind => requestDocumentUrl(value.id, kind)}>
        {Boolean(value.enrollment?.payrollWarnings?.length) && <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {value.enrollment?.payrollWarnings?.map(warning => <li key={warning}>{warning}</li>)}
        </ul>}
        {value.enrollment && <EnrollmentEvidenceEditor key={detailKey} record={value} onChanged={() => {
          reloadDetail(count => count + 1);
          refreshMonth();
        }} />}
        {value.status === "RETURNED" && <Button type="button" onClick={() => setCorrecting(true)}>Correct and resubmit</Button>}
      </EnrollmentDetails>}
    </div>;
  }

  return <div className="space-y-4">
    {importView === "upload" && <LoanImportDialog close={() => setImportView(null)} onSaved={id => {
      setImportedBatch(id);
      setImportView("history");
      refreshMonth();
    }} />}
    {importView === "history" && <LoanImportHistoryDialog initialBatch={importedBatch} close={() => setImportView(null)} onSelect={id => {
      setImportView(null);
      setSelected(id);
    }} />}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">Loan enrollment</h2>
        <p className="mt-1 text-sm text-muted-foreground">Record the approved agency terms and send the loan for verification.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => { setImportedBatch(null); setImportView("history"); }}>Import history</Button>
        <Button type="button" variant="outline" onClick={() => setImportView("upload")}>Import existing loans</Button>
        <Button type="button" onClick={() => setSelected("new")}><Plus /> Enroll existing loan</Button>
      </div>
    </div>
    {agencyError}
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-sm" aria-label="Search enrollments" placeholder="Employee, loan, or agency reference" maxLength={120}
        value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <NativeSelect aria-label="Filter enrollments by agency" value={agency} onChange={event => { setAgency(event.target.value); setPage(1); }}>
        <option value="">All agencies</option>
        {agencies.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Filter enrollments by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="">All statuses</option><option value="APPROVED">Approved · awaiting agency</option>
        <option value="ENROLLED">For verification</option><option value="RETURNED">Returned for correction</option>
        <option value="VERIFIED">Verified · awaiting activation</option>
        <option value="ACTIVATING">Activation pending</option><option value="ACTIVE">Active</option>
      </NativeSelect>
    </div>
    {current?.error && <LoadError message={current.error} retry={refreshMonth} />}
    {!current && <p role="status" className="text-sm text-muted-foreground">Loading enrollments…</p>}
    {current?.data && <>
      {current.data.openMonth && <p className="text-sm text-muted-foreground">Open month {deductionMonthLabel(current.data.openMonth)}</p>}
      {!current.data.openMonth && <p className="text-sm text-muted-foreground">Set the Government Loans open month to enroll loans.</p>}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Loan</TableHead><TableHead>Employee</TableHead><TableHead>Agency / program</TableHead>
            <TableHead className="text-right">Amortization</TableHead><TableHead>First deduction</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!current.data.items.length && <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No enrollments match.</TableCell>
            </TableRow>}
            {current.data.items.map(item => <TableRow key={item.id}>
              <TableCell>
                <Button variant="link" size="sm" type="button" className="px-0" onClick={() => {
                  setSelected(item.id); reloadDetail(value => value + 1);
                }}>{item.reference}</Button>
                {item.enrollment && <span className="block text-xs text-muted-foreground">{item.enrollment.agencyReference}</span>}
              </TableCell>
              <TableCell>{item.employeeName ?? "—"}</TableCell>
              <TableCell>{item.agencyName ?? "—"}<span className="block text-xs text-muted-foreground">{item.program}</span></TableCell>
              <TableCell className="text-right tabular-nums">{item.enrollment ? peso(item.enrollment.monthlyAmortization) : "—"}</TableCell>
              <TableCell>{item.enrollment ? deductionMonthLabel(item.enrollment.firstDeductionMonth) : "—"}</TableCell>
              <TableCell>
                <Badge variant="secondary">{item.status === "APPROVED" ? "Approved · awaiting agency" : requestStatusLabels[item.status]}</Badge>
                {item.enrollment?.externalReferenceCheck === "NEEDS_SOURCE" && <p className="mt-1 text-xs text-muted-foreground">External reference check pending</p>}
              </TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      {(page > 1 || current.data.hasMore) && <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
        <span className="self-center text-xs">Page {page}</span>
        <Button type="button" size="sm" variant="outline" disabled={!current.data.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
      </div>}
    </>}
  </div>;
}
