"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { policiesApi, policyRequest } from "../policy-client";
import { policyFieldLabel, policyValue } from "../policy-labels";
import { policyAreas, type HistoryEntry } from "../policy-types";
import { PolicyInput, PolicyPager, PolicySelect } from "./PolicyForm";

type History = { items: HistoryEntry[]; hasMore: boolean; page: number };
type Result = { query: string; data: History } | { query: string; error: string };

function ChangedFields({ entry }: { entry: HistoryEntry }) {
  const keys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
  return <div className="mt-2 max-w-[36rem] rounded-md border">
    <Table aria-label="Changed values">
      <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead></TableRow></TableHeader>
      <TableBody>{keys.map(key => <TableRow key={key}>
        <TableCell className="whitespace-normal">{policyFieldLabel(key)}</TableCell>
        <TableCell className="whitespace-pre-wrap break-words">{policyValue(key, entry.before?.[key])}</TableCell>
        <TableCell className="whitespace-pre-wrap break-words">{policyValue(key, entry.after?.[key])}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>;
}

export function PolicyHistory() {
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>();
  const params = new URLSearchParams({ q: search.trim(), area, page: String(page) }).toString();
  const key = `${params}:${attempt}`;
  const current = result?.query === key ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void policyRequest<History>(`${policiesApi}/history?${params}`, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) setResult({ query: key, data });
      }).catch(error => {
        if (!controller.signal.aborted) setResult({ query: key, error: error.message });
      });
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [key, params]);

  return <section className="space-y-3 rounded-lg border bg-card p-4">
    <h2 className="font-semibold">Policy change history</h2>
    <div className="grid max-w-3xl gap-3 sm:grid-cols-[2fr_1fr]">
      <PolicyInput label="Search by person or change" maxLength={200} value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <PolicySelect label="Policy area" value={area} onChange={event => { setArea(event.target.value); setPage(1); }}>
        <option value="">All areas</option>
        {[...new Set(Object.values(policyAreas))].map(label => <option key={label}>{label}</option>)}
      </PolicySelect>
    </div>
    {!current && <p className="text-sm text-muted-foreground" role="status">Loading policy changes…</p>}
    {current && "error" in current && <div role="alert" className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-destructive">{current.error}</p>
      <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
    </div>}
    {current && "data" in current && <>
      {current.data.items.length ? <div className="rounded-md border"><Table>
        <TableHeader><TableRow>
          <TableHead>When (PHT)</TableHead><TableHead>Changed by</TableHead><TableHead>Policy area</TableHead><TableHead>Change</TableHead>
        </TableRow></TableHeader>
        <TableBody>{current.data.items.map(entry => <TableRow key={entry.id} className="align-top">
          <TableCell>{entry.occurredAt}</TableCell>
          <TableCell className="whitespace-normal">{entry.actorName}</TableCell>
          <TableCell className="whitespace-normal">{entry.area}</TableCell>
          <TableCell className="whitespace-normal">
            <div className="break-words font-medium">{entry.summary}</div>
            <details className="mt-1 text-sm">
              <summary className="w-fit cursor-pointer text-muted-foreground">View changes</summary>
              <ChangedFields entry={entry} />
            </details>
          </TableCell>
        </TableRow>)}</TableBody>
      </Table></div> : <p className="text-sm text-muted-foreground">No policy changes match these filters.</p>}
      <PolicyPager page={current.data.page} more={current.data.hasMore} onPage={setPage} />
    </>}
  </section>;
}
