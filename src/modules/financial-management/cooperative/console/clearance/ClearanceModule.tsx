"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { peso } from "../../members/format";
import type { ClearanceRegister } from "../../server/clearance-store";
import { caseStatusChip, EmptyState, FilterBar, FilterField, Panel, StatusChip, Tile } from "../components/ui";
import { formatDate } from "../format";
import { CASE_STATUS_LABEL, CLEARANCE_REASONS } from "../types";
import { ClearanceDetailDialog, StartClearanceDialog } from "./ClearanceDialogs";
import { clearanceEndpoint, useClearanceData } from "./useClearanceData";

export default function ClearanceModule() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number>();
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState("");
  const params = new URLSearchParams({ q: search, status, reason, page: String(page) });
  const { data, loading, error, reload } = useClearanceData<ClearanceRegister>(`${clearanceEndpoint}?${params}`, 180);
  const activePage = data?.page ?? page;
  const ready = !loading && !error && data;

  function refresh(message?: string) {
    if (message) setNotice(message);
    reload();
  }

  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground">Cooperative</p>
        <h1 className="text-2xl font-semibold tracking-tight">Exit clearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Start a clearance, attach separation papers, and verify final pay.</p>
      </div>
      <Button size="sm" onClick={() => setStarting(true)}>Start clearance</Button>
    </div>
    {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile label="Settlement review" value={ready ? data.counts.draft : "—"} detail="Draft clearances" />
      <Tile label="Settled & closed" value={ready ? data.counts.completed : "—"} detail="Memberships closed" />
      <Tile label="Cancelled" value={ready ? data.counts.cancelled : "—"} />
    </div>
    <Panel title="Clearance register">
      <FilterBar count={ready ? data.total : undefined} noun="clearances">
        <FilterField label="Search">
          <Input value={search} aria-label="Search clearances" placeholder="Member or clearance no." className="h-8 w-full sm:w-64"
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </FilterField>
        <FilterField label="Stage">
          <NativeSelect value={status} aria-label="Stage" className="h-8"
            onChange={event => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All stages</option>
            {Object.entries(CASE_STATUS_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </NativeSelect>
        </FilterField>
        <FilterField label="Reason">
          <NativeSelect value={reason} aria-label="Reason" className="h-8"
            onChange={event => { setReason(event.target.value); setPage(1); }}>
            <option value="">All reasons</option>
            {Object.entries(CLEARANCE_REASONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </NativeSelect>
        </FilterField>
        {(search || status || reason) && <Button variant="ghost" size="sm" onClick={() => {
          setSearch(""); setStatus(""); setReason(""); setPage(1);
        }}>Clear filters</Button>}
      </FilterBar>
      {error && <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-destructive">
        {error}<Button variant="outline" size="sm" onClick={reload}>Retry</Button>
      </div>}
      <div className="overflow-auto rounded-md border">
        <Table aria-busy={loading}>
          <TableHeader><TableRow>
            <TableHead>Clearance</TableHead><TableHead>Member</TableHead><TableHead>Reason</TableHead>
            <TableHead>Separation date</TableHead><TableHead>Documents</TableHead>
            <TableHead className="text-right">Owed</TableHead><TableHead className="text-right">Posted savings</TableHead><TableHead>Stage</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8}><EmptyState>Loading clearances…</EmptyState></TableCell></TableRow>}
            {ready && !data.rows.length && <TableRow><TableCell colSpan={8}>
              <EmptyState>{search || status || reason ? "No clearances match these filters." : "No clearances yet."}</EmptyState>
            </TableCell></TableRow>}
            {ready && data.rows.map(row => <TableRow key={row.id} className="cursor-pointer" tabIndex={0}
              aria-label={`Open ${row.reference}`} onClick={() => setSelectedId(row.id)} onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(row.id); }
              }}>
              <TableCell className="font-mono">{row.reference}</TableCell>
              <TableCell className="whitespace-normal">
                {row.member.name}
                <span className="block text-xs text-muted-foreground">
                  {row.member.employeeNumber}{row.member.department ? ` · ${row.member.department}` : ""}
                </span>
              </TableCell>
              <TableCell>{CLEARANCE_REASONS[row.reason]}</TableCell>
              <TableCell>{formatDate(row.separationDate)}</TableCell>
              <TableCell>{row.documents.required > 0 ? <StatusChip
                status={row.documents.blocks.length ? "REJECTED" : row.documents.warnings.length ? "PARTIAL" : "ACTIVE"}
                label={`${row.documents.onFile}/${row.documents.required} on file`} /> : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{row.owed === null ? "Unavailable" : peso(row.owed)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(row.savings)}</TableCell>
              <TableCell>{caseStatusChip(row.status)}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        Page {activePage}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={activePage === 1 || !ready} onClick={() => setPage(activePage - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={!ready || !data.hasMore} onClick={() => setPage(activePage + 1)}>Next</Button>
        </div>
      </div>
    </Panel>
    {starting && <StartClearanceDialog onClose={() => setStarting(false)} onSaved={result => {
      setStarting(false);
      setSelectedId(result.id);
      refresh(`${result.reference} saved as a draft.`);
    }} />}
    {selectedId !== undefined && <ClearanceDetailDialog key={selectedId} id={selectedId} onClose={() => setSelectedId(undefined)} onChanged={refresh} />}
  </main>;
}
