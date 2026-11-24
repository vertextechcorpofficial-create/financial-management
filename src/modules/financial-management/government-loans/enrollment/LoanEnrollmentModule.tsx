"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { agencyOptions, requestDocumentUrl } from "../requests/request-api";
import { RequestDetails } from "../requests/RequestReview";
import { requestStatusLabels, type AgencyChoice } from "../requests/types";
import { getEnrollment, listEnrollments } from "./api";
import { EnrollmentEditor } from "./EnrollmentEditor";
import { deductionMonthLabel } from "./rules";
import type { EnrollmentDetail, EnrollmentPage, EnrollmentSnapshot } from "./types";

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message}<Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function SavedTerms({ enrollment }: { enrollment: EnrollmentSnapshot }) {
  const values = [
    ["Agency reference", enrollment.agencyReference],
    ["Original principal", peso(enrollment.originalPrincipal)],
    ["Exact monthly amortization", peso(enrollment.monthlyAmortization)],
    ["Number of installments", enrollment.installmentCount],
    ["Installments already paid", enrollment.installmentsPaid],
    ["First deduction month", deductionMonthLabel(enrollment.firstDeductionMonth)],
    ["Prior Payroll loan", enrollment.priorLoanId ?? "—"],
    ["Enrollment source", { REQUEST: "Approved request", EXISTING: "Existing loan", TRANSFER: "Transfer" }[enrollment.origin]],
    ["Encoded by", enrollment.encodedBy.name],
    ["Encoded at", dateTime(enrollment.encodedAt) + " PHT"],
  ];
  return <section aria-label="Saved loan terms" className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap gap-2">
      {enrollment.referenceConfirmed && <Badge variant="outline">Reference confirmed as printed</Badge>}
      {enrollment.externalReferenceCheck === "NEEDS_SOURCE" && <Badge variant="outline">External reference check pending</Badge>}
    </div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {values.map(([label, value]) => <div key={label}>
        <dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd>
      </div>)}
    </dl>
    <p className="text-sm text-muted-foreground">For verification. A second person checks the agency notice and authority to deduct.</p>
  </section>;
}

export function LoanEnrollmentModule() {
  const [selected, setSelected] = useState<number | "new" | null>(null);
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

  const back = () => { setSelected(null); setNotice(""); };
  const refreshMonth = () => reloadList(value => value + 1);
  const agencyError = agencies.error && <LoadError message={agencies.error} retry={() => reloadAgencies(value => value + 1)} />;
  if (selected !== null) {
    const value = record?.data;
    if (selected === "new" || value?.status === "APPROVED") return <div className="space-y-3">
      {agencyError}
      <EnrollmentEditor key={detailKey} record={value} agencies={agencies.items} openMonth={list?.data?.openMonth ?? null}
        onBack={back} onReload={() => reloadDetail(count => count + 1)} refreshMonth={refreshMonth} onSaved={result => {
          setNotice(result.status === "ENROLLED" ? "Enrollment saved for verification." : "Agency decline recorded.");
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
      {value && <>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{value.reference}</h2>
            <Badge variant="secondary">{requestStatusLabels[value.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{[value.employeeName, value.agencyName, value.program].filter(Boolean).join(" · ")}</p>
        </div>
        {value.enrollment && <SavedTerms enrollment={value.enrollment} />}
        {(value.request.requestedAt || value.request.status === "AGENCY_DECLINED") &&
          <RequestDetails record={value.request} documentHref={kind => requestDocumentUrl(value.id, kind)} />}
      </>}
    </div>;
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">Loan enrollment</h2>
        <p className="mt-1 text-sm text-muted-foreground">Record the approved agency terms and send the loan for verification.</p>
      </div>
      <Button type="button" onClick={() => setSelected("new")}><Plus /> Enroll existing loan</Button>
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
        <option value="">All statuses</option><option value="APPROVED">Approved · awaiting agency</option><option value="ENROLLED">For verification</option>
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
