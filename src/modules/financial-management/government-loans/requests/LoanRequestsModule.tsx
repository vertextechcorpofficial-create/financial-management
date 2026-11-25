"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { employeeRequestApi, staffRequestApi } from "./request-api";
import { RequestEditor } from "./RequestEditor";
import { requestStatusLabels, requestStatusTone, requestViews, type AgencyChoice, type EmployeeChoice, type LoanRequest, type RequestListItem, type RequestPage, type RequestView } from "./types";

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message} <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function nextAction(item: RequestListItem) {
  if (item.status === "DRAFT") return "Continue draft";
  if (item.status === "REQUESTED" || item.status === "APPROVED") return "View approval";
  if (item.status === "RETURNED") return "View return";
  if (item.status === "REJECTED" || item.status === "CANCELLED" || item.status === "AGENCY_DECLINED") return "View decision";
  if (item.status === "ENROLLED" || item.status === "VERIFIED" || item.status === "ACTIVATING") return "View status";
  if (item.status === "ACTIVE") return "View loan";
  return "Open request";
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border bg-card p-3">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="text-xl font-semibold tabular-nums">{value.toLocaleString("en-PH")}</p>
  </div>;
}

export function LoanRequestsModule({ applicant }: { applicant?: Pick<EmployeeChoice, "id" | "name"> } = {}) {
  const { agencyOptions, getRequest, getRequests } = applicant ? employeeRequestApi : staffRequestApi;
  const [view, setView] = useState<RequestView>("in-progress");
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [agencyAttempt, setAgencyAttempt] = useState(0);
  const [agencies, setAgencies] = useState<{ items: AgencyChoice[]; error?: string }>({ items: [] });
  const [list, setList] = useState<{ key: string; data?: RequestPage; error?: string }>();
  const [detail, setDetail] = useState<{ id: number; attempt: number; record?: LoanRequest; error?: string }>();
  const [notice, setNotice] = useState("");
  const query = new URLSearchParams({ view, q: search.trim(), page: String(page) });
  if (agency) query.set("agency", agency);
  const serialized = query.toString();
  const listKey = serialized + ":" + attempt;
  const current = list?.key === listKey ? list : undefined;
  const isDrafts = view === "drafts";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const results: AgencyChoice[] = [];
      let page = 1;
      for (;;) {
        const response = await agencyOptions(page, controller.signal);
        results.push(...response.items);
        if (!response.hasMore) break;
        page++;
      }
      if (!controller.signal.aborted) setAgencies({ items: results });
    }
    void load().catch(error => {
      if (!controller.signal.aborted) setAgencies({ items: [], error: error instanceof Error ? error.message : "Agencies could not be loaded." });
    });
    return () => controller.abort();
  }, [agencyAttempt, agencyOptions]);

  useEffect(() => {
    if (selected !== null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getRequests(serialized, controller.signal).then(data => {
        if (!controller.signal.aborted) setList({ key: listKey, data });
      }).catch(error => {
        if (!controller.signal.aborted) setList({ key: listKey, error: error instanceof Error ? error.message : "Requests could not be loaded." });
      });
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selected, serialized, listKey, getRequests]);

  useEffect(() => {
    if (typeof selected !== "number") return;
    const controller = new AbortController();
    getRequest(selected, controller.signal).then(record => {
      if (!controller.signal.aborted) setDetail({ id: selected, attempt, record });
    }).catch(error => {
      if (!controller.signal.aborted) setDetail({ id: selected, attempt, error: error instanceof Error ? error.message : "The request could not be loaded." });
    });
    return () => controller.abort();
  }, [selected, attempt, getRequest]);

  function showList(next?: RequestView, message = "") {
    setSelected(null);
    setDetail(undefined);
    setAttempt(value => value + 1);
    setNotice(message);
    if (next) {
      setView(next);
      setPage(1);
      setSearch("");
      setAgency("");
    }
  }

  const record = detail?.id === selected && detail?.attempt === attempt ? detail : undefined;
  const agencyError = agencies.error && <LoadError message={agencies.error} retry={() => setAgencyAttempt(value => value + 1)} />;
  if (selected !== null) return <div className="space-y-3">
    {agencyError}
    {selected === "new" || record?.record ? <RequestEditor key={selected + ":" + attempt} initial={record?.record ?? null}
      agencies={agencies.items} applicant={applicant} onBack={showList} onReload={id => { setSelected(id); setAttempt(value => value + 1); }} /> :
      <div className="space-y-3">
        <Button variant="ghost" onClick={() => showList()}>Back to requests</Button>
        {record?.error ? <LoadError message={record.error} retry={() => setAttempt(value => value + 1)} /> :
          <p role="status" className="text-sm text-muted-foreground">Loading request…</p>}
      </div>}
  </div>;

  return <div className="space-y-4">
    {notice && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
      <span>{notice}</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => setNotice("")}>Dismiss</Button>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">{applicant ? isDrafts ? "Your unfinished requests" : "Your loan requests" : "Loan requests"}</h2>
      <Button type="button" onClick={() => setSelected("new")}><Plus /> {applicant ? "Apply for a loan" : "New request"}</Button>
    </div>
    {agencyError}
    {current?.data?.summary && <section aria-label="Request queue summary" className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Queue overview</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Drafts" value={current.data.summary.DRAFT} />
        <SummaryCard label="Awaiting approval" value={current.data.summary.REQUESTED} />
        <SummaryCard label="Approved · awaiting agency" value={current.data.summary.APPROVED} />
        <SummaryCard label="Returned for correction" value={current.data.summary.RETURNED} />
      </div>
    </section>}
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(requestViews) as RequestView[]).map(value =>
        <Button key={value} type="button" variant={view === value ? "default" : "outline"} aria-pressed={view === value}
          onClick={() => { setNotice(""); setView(value); setPage(1); }}>{requestViews[value].label}</Button>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-sm" aria-label="Search requests" placeholder={applicant ? "Agency or request no." : "Employee, agency, or request no."}
        value={search} maxLength={120} onChange={event => { setNotice(""); setSearch(event.target.value); setPage(1); }} />
      <NativeSelect aria-label="Filter by agency" value={agency} onChange={event => { setNotice(""); setAgency(event.target.value); setPage(1); }}>
        <option value="">All agencies</option>
        {agencies.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      {(search || agency) && <Button type="button" variant="ghost" size="sm" onClick={() => { setNotice(""); setSearch(""); setAgency(""); setPage(1); }}>Clear filters</Button>}
    </div>
    {current?.error && <LoadError message={current.error} retry={() => setAttempt(value => value + 1)} />}
    {!current && <p role="status" className="text-sm text-muted-foreground">Loading loan requests…</p>}
    {current?.data && <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Request</TableHead>{!applicant && <TableHead>Employee</TableHead>}<TableHead>Agency / program</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>{isDrafts ? "Missing fields" : "Status"}</TableHead>
            <TableHead>Next action</TableHead>
            <TableHead>{isDrafts ? "Last saved" : view === "decided" ? "Last updated" : "Filed"}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!current.data.items.length && <TableRow><TableCell colSpan={applicant ? 6 : 7} className="py-8 text-center text-muted-foreground">
              {isDrafts ? "No drafts found." : view === "decided" ? "No request history found." : "No submitted requests found."}
            </TableCell></TableRow>}
            {current.data.items.map(item => <TableRow key={item.id}>
              <TableCell><Button variant="link" size="sm" className="px-0" type="button" onClick={() => setSelected(item.id)}>{item.reference}</Button></TableCell>
              {!applicant && <TableCell>{item.employeeName ?? "—"}</TableCell>}
              <TableCell>{item.agencyName ?? "—"}{item.program && <span className="block text-xs text-muted-foreground">{item.program}</span>}</TableCell>
              <TableCell className="text-right tabular-nums">{item.amount ? peso(item.amount) : "—"}</TableCell>
              <TableCell>{isDrafts ? Object.keys(item.missing).length
                ? <ul className="min-w-40 space-y-0.5 text-xs">{Object.values(item.missing).map(error => <li key={error}>{error}</li>)}</ul>
                : <Badge variant="outline">Ready to submit</Badge> : <Badge variant="outline" className={requestStatusTone[item.status]}>{requestStatusLabels[item.status]}</Badge>}</TableCell>
              <TableCell><Button type="button" variant="outline" size="sm" onClick={() => setSelected(item.id)}>{nextAction(item)}</Button></TableCell>
              <TableCell className="whitespace-nowrap">{dateTime(view === "in-progress" ? item.requestedAt ?? item.updatedAt : item.updatedAt)}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      {(page > 1 || current.data.hasMore) && <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="self-center text-xs">Page {page}</span>
        <Button size="sm" variant="outline" disabled={!current.data.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
      </div>}
    </>}
  </div>;
}
