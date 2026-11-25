"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { AgencyForm } from "./AgencyForm";
import { AgencyHistoryDialog } from "./AgencyHistoryDialog";
import { fetchAgencies } from "./agencies-api";
import { AGENCY_TYPES, DEADLINE_RULES, PENALTY_BASES, type Agency, type AgencyPage } from "./types";

function AgencyCard({ agency, editing, onEdit, onHistory }: {
  agency: Agency;
  editing: boolean;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const details = [
    ["Loan programs", agency.programs.join(", ")],
    ["Reference example", agency.referenceExample],
    ["Payment reference label", agency.paymentReferenceLabel],
    ["Payout options", agency.payoutOptions.join(", ")],
    ["Employer number", agency.employerNumber],
    ["Remittance deadline", agency.deadlineRule === "FIXED_DAY" ? `Day ${agency.deadlineDay} of the following month` : DEADLINE_RULES[agency.deadlineRule]],
    ["Late-payment penalty", agency.penaltyBasis === "NONE" ? PENALTY_BASES.NONE : `${agency.penaltyRatePercent}% · ${PENALTY_BASES[agency.penaltyBasis]}`],
    ["Reminder", `${agency.reminderDays} days before deadline`],
    ["Add missed deductions to next month", agency.catchUp ? "Yes" : "No"],
    ["Sends a monthly billing", agency.sendsBilling ? "Yes" : "No"],
  ];
  return <article className="space-y-3 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="break-all font-semibold">{agency.displayName}</h3>
          <Badge variant="outline">{agency.shortCode}</Badge>
          <Badge variant={agency.isActive ? "secondary" : "outline"}>{agency.isActive ? "Active" : "Inactive"}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {agency.fullName !== agency.displayName ? `${agency.fullName} · ` : ""}{AGENCY_TYPES[agency.agencyType]}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onHistory} aria-label={`${agency.displayName} history`}>History</Button>
        <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={editing} aria-label={`Edit ${agency.displayName}`}>Edit</Button>
      </div>
    </div>
    <dl className="grid gap-3 border-t pt-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
      {details.filter(([, value]) => value).map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="wrap-anywhere">{value}</dd>
      </div>)}
    </dl>
  </article>;
}

type LoadResult = { key: string; data: AgencyPage } | { key: string; error: string };

export function AgenciesModule() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<LoadResult>();
  const [editor, setEditor] = useState<"new" | Agency | null>(null);
  const [history, setHistory] = useState<Agency | null>(null);
  const [notice, setNotice] = useState("");
  const query = new URLSearchParams({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    page: String(page),
  }).toString();
  const key = `${query}#${refresh}`;
  const current = result?.key === key ? result : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchAgencies(query, controller.signal).then(data => {
        if (!controller.signal.aborted) setResult({ key, data });
      }).catch(error => {
        if (!controller.signal.aborted) {
          setResult({ key, error: error instanceof Error ? error.message : "Could not load agencies." });
        }
      });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, query]);

  function openEditor(value: "new" | Agency) {
    setNotice("");
    setEditor(value);
  }

  function reloadAgencies() {
    setEditor(null);
    setPage(1);
    setRefresh(value => value + 1);
  }

  return <section aria-labelledby="government-loan-agencies-heading" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="government-loan-agencies-heading" className="text-lg font-semibold">Agencies</h2>
      <Button type="button" onClick={() => openEditor("new")} disabled={editor !== null}>Add agency</Button>
    </div>
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {editor && <AgencyForm key={editor === "new" ? "new" : editor.id} agency={editor === "new" ? undefined : editor} onReload={reloadAgencies}
      onCancel={() => setEditor(null)} onSaved={saved => {
        setNotice(`${saved.displayName} ${editor === "new" ? "added" : "updated"}.`);
        reloadAgencies();
      }} />}
    {history && <AgencyHistoryDialog agency={history} onClose={() => setHistory(null)} />}
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor="agency-search">Search agencies</Label>
        <Input id="agency-search" placeholder="Code, name, or program" value={search} maxLength={160} onChange={event => {
          setSearch(event.target.value); setPage(1);
        }} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agency-type-filter">Type</Label>
        <NativeSelect id="agency-type-filter" value={type} onChange={event => { setType(event.target.value); setPage(1); }}>
          <option value="">All types</option>
          {Object.entries(AGENCY_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agency-status-filter">Status</Label>
        <NativeSelect id="agency-status-filter" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </NativeSelect>
      </div>
    </div>
    {!current && <p role="status" className="text-sm text-muted-foreground">Loading agencies…</p>}
    {current && "error" in current && <div className="space-y-2 rounded-lg border border-destructive/30 p-4">
      <p role="alert" className="text-sm text-destructive">{current.error}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>Retry</Button>
    </div>}
    {current && "data" in current && <>
      {current.data.agencies.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No agencies match the filters.</p>}
      {current.data.agencies.map(agency => <AgencyCard key={agency.id} agency={agency} editing={editor !== null}
        onEdit={() => openEditor(agency)} onHistory={() => setHistory(agency)} />)}
      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">Page {page}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setPage(value => value - 1)} disabled={page === 1}>Previous page</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setPage(value => value + 1)} disabled={!current.data.hasMore}>Next page</Button>
      </div>
    </>}
  </section>;
}
