"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { agencyOptions, getRequest, getRequests } from "./request-api";
import { RequestEditor } from "./RequestEditor";
import { requestStatusLabels, requestViews, type AgencyChoice, type LoanRequest, type Page, type RequestListItem, type RequestView } from "./types";

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message} <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

export function LoanRequestsModule() {
  const [view, setView] = useState<RequestView>("in-progress");
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [agencyAttempt, setAgencyAttempt] = useState(0);
  const [agencies, setAgencies] = useState<{ items: AgencyChoice[]; error?: string }>({ items: [] });
  const [list, setList] = useState<{ key: string; data?: Page<RequestListItem>; error?: string }>();
  const [detail, setDetail] = useState<{ id: number; attempt: number; record?: LoanRequest; error?: string }>();
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
  }, [agencyAttempt]);

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
  }, [selected, serialized, listKey]);

  useEffect(() => {
    if (typeof selected !== "number") return;
    const controller = new AbortController();
    getRequest(selected, controller.signal).then(record => {
      if (!controller.signal.aborted) setDetail({ id: selected, attempt, record });
    }).catch(error => {
      if (!controller.signal.aborted) setDetail({ id: selected, attempt, error: error instanceof Error ? error.message : "The request could not be loaded." });
    });
    return () => controller.abort();
  }, [selected, attempt]);

  function showList(next?: RequestView) {
    setSelected(null);
    setDetail(undefined);
    setAttempt(value => value + 1);
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
      agencies={agencies.items} onBack={showList} onReload={id => { setSelected(id); setAttempt(value => value + 1); }} /> :
      <div className="space-y-3">
        <Button variant="ghost" onClick={() => showList()}>Back to requests</Button>
        {record?.error ? <LoadError message={record.error} retry={() => setAttempt(value => value + 1)} /> :
          <p role="status" className="text-sm text-muted-foreground">Loading request…</p>}
      </div>}
  </div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">Loan requests</h2>
      <Button type="button" onClick={() => setSelected("new")}><Plus /> New request</Button>
    </div>
    {agencyError}
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(requestViews) as RequestView[]).map(value =>
        <Button key={value} type="button" variant={view === value ? "default" : "outline"} aria-pressed={view === value}
          onClick={() => { setView(value); setPage(1); }}>{requestViews[value].label}</Button>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-sm" aria-label="Search requests" placeholder="Employee, agency, or request no."
        value={search} maxLength={120} onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <NativeSelect aria-label="Filter by agency" value={agency} onChange={event => { setAgency(event.target.value); setPage(1); }}>
        <option value="">All agencies</option>
        {agencies.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
    </div>
    {current?.error && <LoadError message={current.error} retry={() => setAttempt(value => value + 1)} />}
    {!current && <p role="status" className="text-sm text-muted-foreground">Loading loan requests…</p>}
    {current?.data && <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Request</TableHead><TableHead>Employee</TableHead><TableHead>Agency / program</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>{isDrafts ? "Missing fields" : "Status"}</TableHead>
            <TableHead>{isDrafts ? "Last saved" : view === "decided" ? "Last updated" : "Filed"}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!current.data.items.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              {isDrafts ? "No drafts found." : view === "decided" ? "No decisions found." : "No submitted requests found."}
            </TableCell></TableRow>}
            {current.data.items.map(item => <TableRow key={item.id}>
              <TableCell><Button variant="link" size="sm" className="px-0" type="button" onClick={() => setSelected(item.id)}>{item.reference}</Button></TableCell>
              <TableCell>{item.employeeName ?? "—"}</TableCell>
              <TableCell>{item.agencyName ?? "—"}{item.program && <span className="block text-xs text-muted-foreground">{item.program}</span>}</TableCell>
              <TableCell className="text-right tabular-nums">{item.amount ? peso(item.amount) : "—"}</TableCell>
              <TableCell>{isDrafts ? Object.keys(item.missing).length
                ? <ul className="min-w-40 space-y-0.5 text-xs">{Object.values(item.missing).map(error => <li key={error}>{error}</li>)}</ul>
                : <Badge variant="outline">Ready to submit</Badge> : <Badge variant="secondary">{requestStatusLabels[item.status]}</Badge>}</TableCell>
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
