"use client";

import { useEffect, useRef, useState } from "react";
import { SearchX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "../../components/ui";
import { AgencyForm } from "./AgencyForm";
import { AgencyHistoryDialog } from "./AgencyHistoryDialog";
import { AgencyRequestError, fetchAgencies, saveAgency } from "./agencies-api";
import { AGENCY_TYPES, DEADLINE_RULES, PENALTY_BASES, type Agency, type AgencyPage } from "./types";

function AgencyCard({ agency, editing, busy, onEdit, onHistory, onToggle }: {
  agency: Agency;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onToggle: () => void;
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
          <span className="flex items-center gap-2 text-sm">
            <Switch checked={agency.isActive} disabled={busy} onCheckedChange={onToggle}
              aria-label={`${agency.displayName} active status`} />
            {busy ? "Saving…" : agency.isActive ? "Active" : "Inactive"}
          </span>
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
  const [toggling, setToggling] = useState<number | null>(null);
  const skipUrlWrite = useRef(true);
  const query = new URLSearchParams({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    page: String(page),
  }).toString();
  const key = `${query}#${refresh}`;
  const current = result?.key === key ? result : undefined;

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("agencyQ") ?? "");
      setType(params.get("agencyType") ?? "");
      setStatus(params.get("agencyStatus") ?? "");
      setPage(Math.max(1, Number(params.get("agencyPage")) || 1));
    };
    syncFromLocation();
    skipUrlWrite.current = true;
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (skipUrlWrite.current) { skipUrlWrite.current = false; return; }
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => value ? params.set(key, value) : params.delete(key);
    setOrDelete("agencyQ", search.trim());
    setOrDelete("agencyType", type);
    setOrDelete("agencyStatus", status);
    setOrDelete("agencyPage", page > 1 ? String(page) : "");
    const next = params.toString();
    const target = window.location.pathname + (next ? "?" + next : "") + window.location.hash;
    const location = window.location.pathname + window.location.search + window.location.hash;
    if (target !== location) window.history.replaceState(window.history.state, "", target);
  }, [search, type, status, page]);

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
    setEditor(value);
  }

  function reloadAgencies() {
    setEditor(null);
    setPage(1);
    setRefresh(value => value + 1);
  }

  async function toggleAgency(agency: Agency) {
    if (toggling !== null) return;
    setToggling(agency.id);
    try {
      const saved = await saveAgency({
        expectedRevision: agency.revision,
        isActive: !agency.isActive,
        displayName: agency.displayName,
        fullName: agency.fullName,
        agencyType: agency.agencyType,
        programs: agency.programs,
        referenceExample: agency.referenceExample,
        paymentReferenceLabel: agency.paymentReferenceLabel,
        payoutOptions: agency.payoutOptions,
        employerNumber: agency.employerNumber,
        deadlineRule: agency.deadlineRule,
        deadlineDay: agency.deadlineDay,
        penaltyBasis: agency.penaltyBasis,
        penaltyRatePercent: agency.penaltyRatePercent,
        reminderDays: agency.reminderDays,
        catchUp: agency.catchUp,
        sendsBilling: agency.sendsBilling,
      }, agency.id);
      toast.success(`${saved.displayName} ${saved.isActive ? "activated" : "deactivated"}.`);
      if (status) setPage(1);
      setRefresh(value => value + 1);
    } catch (cause) {
      toast.error(cause instanceof AgencyRequestError ? cause.message : "Could not update the agency status.");
    } finally {
      setToggling(null);
    }
  }

  return <section aria-labelledby="government-loan-agencies-heading" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="government-loan-agencies-heading" className="text-lg font-semibold">Agencies</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Agencies and lenders the company remits to. Update remittance rules, references, penalties, and which agencies are active.
        </p>
      </div>
      <Button type="button" onClick={() => openEditor("new")} disabled={editor !== null}>Add agency</Button>
    </div>
    {editor && <AgencyForm key={editor === "new" ? "new" : editor.id} agency={editor === "new" ? undefined : editor} onReload={reloadAgencies}
      onCancel={() => setEditor(null)} onSaved={saved => {
        toast.success(`${saved.displayName} ${editor === "new" ? "added" : "updated"}.`);
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
      {(search || type || status) && <Button type="button" variant="ghost" size="sm"
        onClick={() => { setSearch(""); setType(""); setStatus(""); setPage(1); }}>Clear filters</Button>}
    </div>
    {!current && <div className="space-y-2">
      {[0, 1].map(index => <div key={index} className="space-y-3 rounded-lg border bg-card p-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-24 w-full" />
      </div>)}
    </div>}
    {current && "error" in current && <div className="space-y-2 rounded-lg border border-destructive/30 p-4">
      <p role="alert" className="text-sm text-destructive">{current.error}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>Retry</Button>
    </div>}
    {current && "data" in current && <>
      {current.data.agencies.length === 0 && <div className="rounded-lg border p-4">
        <EmptyState icon={SearchX} title="No agencies match" description="Try a different search, type, or status."
          action={(search || type || status) ? <Button type="button" variant="outline" size="sm"
            onClick={() => { setSearch(""); setType(""); setStatus(""); setPage(1); }}>Clear filters</Button> : undefined} />
      </div>}
      {current.data.agencies.map(agency => <AgencyCard key={agency.id} agency={agency} editing={editor !== null}
        busy={toggling === agency.id} onEdit={() => openEditor(agency)} onHistory={() => setHistory(agency)}
        onToggle={() => void toggleAgency(agency)} />)}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">Inactive agencies stay in history and reports; amounts already withheld can still be remitted.</p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Page {page}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setPage(value => value - 1)} disabled={page === 1}>Previous page</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPage(value => value + 1)} disabled={!current.data.hasMore}>Next page</Button>
        </div>
      </div>
    </>}
  </section>;
}
