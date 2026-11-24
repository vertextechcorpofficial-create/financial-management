"use client";

import { useEffect, useState } from "react";
import { ChevronRight, History, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "../../console/components/ui";
import { PersonAvatar } from "../../members/components";
import { policiesApi, policyRequest } from "../policy-client";
import { policyFieldLabel, policyValue } from "../policy-labels";
import { policyAreas, type HistoryEntry } from "../policy-types";
import { PolicyAreaBadge, PolicyEmpty, PolicyTableSkeleton } from "./PolicyUi";
import { PolicyPager } from "./PolicyForm";

type History = { items: HistoryEntry[]; hasMore: boolean; page: number };
type Result = { query: string; data: History } | { query: string; error: string };

function changedKeys(entry: HistoryEntry) {
  return [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
}

function ChangedFields({ entry }: { entry: HistoryEntry }) {
  const keys = changedKeys(entry);
  return <div className="mt-2 overflow-x-auto rounded-xl border bg-background">
    <Table aria-label="Changed values">
      <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableHead scope="col">Field</TableHead>
        <TableHead scope="col">Before</TableHead>
        <TableHead scope="col">After</TableHead>
      </TableRow></TableHeader>
      <TableBody>{keys.map(key => <TableRow key={key}>
        <TableCell className="whitespace-normal font-medium">{policyFieldLabel(key)}</TableCell>
        <TableCell className="whitespace-pre-wrap break-words text-muted-foreground">{policyValue(key, entry.before?.[key])}</TableCell>
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
  const hasFilters = Boolean(search.trim() || area);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void policyRequest<History>(`${policiesApi}/history?${params}`, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted) setResult({ query: key, data });
      }).catch(error => {
        if (!controller.signal.aborted) setResult({ query: key, error: error instanceof Error ? error.message : "Unable to load policy changes." });
      });
    }, 250);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [key, params]);

  function clearFilters() {
    setSearch("");
    setArea("");
    setPage(1);
  }

  return <Panel title="Policy change history" description="Every save is versioned and audited. Expand a row to compare the values."
    actions={<Badge variant="outline">Audit trail</Badge>}>
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
          Search by person or change
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-8" maxLength={200} value={search} placeholder="Person, product, or summary"
              onChange={event => { setSearch(event.target.value); setPage(1); }} />
          </div>
        </label>
        <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
          Policy area
          <NativeSelect className="h-9 w-full" value={area} onChange={event => { setArea(event.target.value); setPage(1); }}>
            <option value="">All areas</option>
            {[...new Set(Object.values(policyAreas))].map(label => <option key={label}>{label}</option>)}
          </NativeSelect>
        </label>
        <div className="flex items-end">
          <Button type="button" variant="ghost" size="sm" className="h-9" disabled={!hasFilters} onClick={clearFilters}>Clear filters</Button>
        </div>
      </div>
      {current && "data" in current && <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">{current.data.items.length} changes on this page</p>}
    </div>

    {!current && <div className="mt-3"><PolicyTableSkeleton rows={6} columns={4} /></div>}
    {current && "error" in current && <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <p className="min-w-0 flex-1 text-sm text-destructive">{current.error}</p>
      <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
    </div>}
    {current && "data" in current && <>
      {current.data.items.length ? <div className="mt-3 rounded-xl border">
        <Table aria-label="Policy change history">
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead scope="col" className="hidden md:table-cell">When (PHT)</TableHead>
            <TableHead scope="col" className="hidden md:table-cell">Changed by</TableHead>
            <TableHead scope="col" className="hidden lg:table-cell">Policy area</TableHead>
            <TableHead scope="col">Change</TableHead>
          </TableRow></TableHeader>
          <TableBody>{current.data.items.map(entry => {
            const changes = changedKeys(entry).length;
            return <TableRow key={entry.id} className="align-top">
              <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">{entry.occurredAt}</TableCell>
              <TableCell className="hidden whitespace-normal md:table-cell">
                <div className="flex items-center gap-2">
                  <PersonAvatar name={entry.actorName} size="sm" />
                  <span className="truncate font-medium">{entry.actorName}</span>
                </div>
              </TableCell>
              <TableCell className="hidden whitespace-normal lg:table-cell"><PolicyAreaBadge area={entry.area} /></TableCell>
              <TableCell className="whitespace-normal">
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground lg:hidden">
                  <span className="md:hidden">{entry.occurredAt}</span>
                  <span className="md:hidden">{entry.actorName}</span>
                  <PolicyAreaBadge area={entry.area} />
                </div>
                <p className="break-words font-medium">{entry.summary}</p>
                <details className="group mt-1.5 text-sm">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                    View {changes} field change{changes === 1 ? "" : "s"}
                  </summary>
                  <ChangedFields entry={entry} />
                </details>
              </TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </div> : <div className="mt-3 rounded-xl border">
        <PolicyEmpty icon={History} title="No policy changes match these filters"
          description={hasFilters ? "Try a different person, change, or policy area." : "Policy saves will appear here."}
          action={hasFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined} />
      </div>}
      {current.data.items.length > 0 && <div className="mt-3">
        <PolicyPager page={current.data.page} more={current.data.hasMore} onPage={setPage}
          summary={`Page ${current.data.page} · ${current.data.items.length} changes`} />
      </div>}
    </>}
  </Panel>;
}
